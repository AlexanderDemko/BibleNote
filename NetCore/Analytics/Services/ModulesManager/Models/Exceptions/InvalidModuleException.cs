using BibleNote.Analytics.Common.Exceptions;

namespace BibleNote.Analytics.Services.ModulesManager.Models.Exceptions
{
    public class InvalidModuleException : BusinessException
    {
        public InvalidModuleException(string message)
            : base("Invalid module: " + message)
        {
        }
    }
}
