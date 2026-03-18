jest.mock('../../src/database/supabase.js', () => ({
  rpc: jest.fn()
}));

const supabase = require('../../src/database/supabase.js');
const { acquireLock, releaseLock } = require('../../src/jobs/lock.js');

describe('job lock', () => {
  test('acquireLock uses atomic rpc lock function', async () => {
    supabase.rpc.mockResolvedValueOnce({ data: true, error: null });

    const locked = await acquireLock('scan_active_anime', 5);

    expect(locked).toBe(true);
    expect(supabase.rpc).toHaveBeenCalledWith('acquire_job_lock', {
      p_job_name: 'scan_active_anime',
      p_lock_seconds: 300
    });
  });

  test('releaseLock uses rpc unlock function', async () => {
    supabase.rpc.mockResolvedValueOnce({ data: null, error: null });

    await releaseLock('scan_active_anime');

    expect(supabase.rpc).toHaveBeenCalledWith('release_job_lock', { p_job_name: 'scan_active_anime' });
  });
});
