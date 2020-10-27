namespace BibleNote.Common.Exceptions
{
    public class NotFoundException: BusinessException
    {
        public NotFoundException(string message)
            : base(message)
        {

        }
    }
}
