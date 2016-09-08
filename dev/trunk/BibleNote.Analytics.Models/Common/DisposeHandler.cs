using System;

namespace BibleNote.Analytics.Models.Common
{
    public class DisposeHandler: IDisposable
    {
        private readonly Action _endAction;

        public DisposeHandler(Action endAction)
        {
            _endAction = endAction;
        }

        public void Dispose()
        {
            _endAction?.Invoke();
        }
    }
}
