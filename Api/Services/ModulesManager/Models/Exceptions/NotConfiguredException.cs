using BibleNote.Common.Exceptions;

namespace BibleNote.Services.ModulesManager.Models.Exceptions
{
    public class NotConfiguredException : BusinessException
    {
        public NotConfiguredException()
            : base("The program is not configured.")
        {
        }

        public NotConfiguredException(string message)
            : base("The program is not configured. " + message)
        {
        }
    }
}
