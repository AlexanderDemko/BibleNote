using System;
using System.Threading;
using System.Threading.Tasks;

namespace BibleNote.Common.Extensions
{
    public static class SemaphoreSlimExtensions
    {
        public static Task DoInSemaphore(this SemaphoreSlim semaphore, Func<Task> actionAsync)
        {
            return DoInSemaphore<object>(semaphore, async () => { await actionAsync(); return default; });
        }

        public static async Task<T> DoInSemaphore<T>(this SemaphoreSlim semaphore, Func<Task<T>> actionAsync)
        {
            await semaphore.WaitAsync();
            try
            {
                return await actionAsync();
            }
            finally
            {
                semaphore.Release();
            }
        }

        public static T DoInSemaphore<T>(this SemaphoreSlim semaphore, Func<T> action)
        {
            semaphore.Wait();
            try
            {
                return action();
            }
            finally
            {
                semaphore.Release();
            }
        }
    }
}
