const express = require('express');
const router = express.Router();
const webpush = require('web-push');
const supabase = require('../database/supabase');

const hasVapidKeys = Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
if (hasVapidKeys) {
    webpush.setVapidDetails(
        process.env.VAPID_SUBJECT || 'mailto:admin@animex.local',
        process.env.VAPID_PUBLIC_KEY,
        process.env.VAPID_PRIVATE_KEY
    );
} else {
    console.warn('[push] VAPID keys missing. Push notifications are disabled.');
}

async function saveSubscription(userId, subscription) {
    const { endpoint, keys } = subscription;
    const { error } = await supabase
        .from('push_subscriptions')
        .upsert({ user_id: userId, endpoint, p256dh: keys.p256dh, auth: keys.auth }, { onConflict: 'endpoint' });

    if (error) console.error('Error saving subscription:', error.message);
}

async function removeSubscription(userId) {
    const { error } = await supabase
        .from('push_subscriptions')
        .delete({ count: 'exact' })
        .eq('user_id', userId);

    if (error) console.error('Error removing subscription:', error.message);
}

async function sendPushNotification(userId, payloadStr) {
    const { data: rows, error } = await supabase
        .from('push_subscriptions')
        .select('endpoint, p256dh, auth')
        .eq('user_id', userId);

    if (error || !rows || rows.length === 0) return;

    const sendPromises = rows.map(async (row) => {
        const pushSubscription = {
            endpoint: row.endpoint,
            keys: { p256dh: row.p256dh, auth: row.auth }
        };

        try {
            await webpush.sendNotification(pushSubscription, payloadStr);
        } catch (err) {
            if (err.statusCode === 404 || err.statusCode === 410) {
                console.log(`Subscription expired/invalid for user ${userId}. Cleaning up.`);
                await supabase.from('push_subscriptions').delete().eq('endpoint', row.endpoint);
            } else {
                console.error('Failed to send push notification:', err);
            }
        }
    });

    await Promise.allSettled(sendPromises);
}

// GET /api/push/public-key
router.get('/public-key', (req, res) => {
    res.status(200).json({ publicKey: process.env.VAPID_PUBLIC_KEY });
});

router.post('/subscribe', async (req, res) => {
    try {
        const { subscription } = req.body;
        if (!subscription) return res.status(400).json({ error: 'subscription is required' });

        await saveSubscription(req.user.id, subscription);
        res.status(201).json({ message: 'Subscribed successfully' });
    } catch (error) {
        console.error('Error in /push/subscribe:', error);
        res.status(500).json({ error: 'Failed to subscribe' });
    }
});

router.post('/unsubscribe', async (req, res) => {
    try {
        const { endpoint } = req.body;
        if (endpoint) {
            await supabase.from('push_subscriptions').delete().match({ user_id: req.user.id, endpoint });
        } else {
            await removeSubscription(req.user.id);
        }
        res.status(200).json({ message: 'Unsubscribed successfully' });
    } catch (error) {
        console.error('Error in /push/unsubscribe:', error);
        res.status(500).json({ error: 'Failed to unsubscribe' });
    }
});

module.exports = {
    router,
    sendPushNotification
};
