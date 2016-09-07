using BibleNote.Analytics.Contracts.VerseParsing;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace BibleNote.Analytics.Services.VerseParsing
{
    public class ElementParseHandle : IElementParseHandle
    {
        private readonly Action _endAction;

        public ElementParseHandle(Action endAction)
        {
            _endAction = endAction;
        }

        public void Dispose()
        {
            _endAction?.Invoke();
        }
    }
}
