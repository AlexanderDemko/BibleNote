using System;

namespace BibleNote.Analytics.Common.Exceptions
{
    public class BusinessException : Exception
    {
        public BusinessException(string message)
            : base(message)
        {

        }
    }
}
