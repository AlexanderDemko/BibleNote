using BibleNote.Common.Exceptions;

namespace BibleNote.Services.ModulesManager.Models.Exceptions
{
    public class InvalidModuleException : BusinessException
    {
        public InvalidModuleException(string message)
            : base("Invalid module: " + message)
        {
        }
    }
}
