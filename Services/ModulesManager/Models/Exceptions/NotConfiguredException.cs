using BibleNote.Analytics.Common.Exceptions;

namespace BibleNote.Analytics.Services.ModulesManager.Models.Exceptions
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
