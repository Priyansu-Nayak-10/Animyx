const supabase = require('../database/supabase.js');

async function acquireLock(jobName, lockDurationMinutes = 10) {
    const { data, error } = await supabase.rpc('acquire_job_lock', {
        p_job_name: jobName,
        p_lock_seconds: Math.max(60, Math.floor(lockDurationMinutes * 60))
    });
    return !error && data === true;
}

async function releaseLock(jobName) {
    await supabase.rpc('release_job_lock', { p_job_name: jobName });
}

module.exports = {
  acquireLock: require('./jobs.js').acquireLock,
  releaseLock: require('./jobs.js').releaseLock
};
