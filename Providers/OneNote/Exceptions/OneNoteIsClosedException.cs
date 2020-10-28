using BibleNote.Common.Exceptions;

namespace BibleNote.Providers.OneNote.Exceptions
{
    public class OneNoteIsClosedException : BusinessException
    {
        public OneNoteIsClosedException() 
            : base()
        {

        }

        public OneNoteIsClosedException(string message) 
            : base(message)
        {
        }
    }
}
