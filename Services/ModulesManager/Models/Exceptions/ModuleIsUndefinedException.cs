namespace BibleNote.Services.ModulesManager.Models.Exceptions
{
    public class ModuleIsUndefinedException : InvalidModuleException
    {
        public ModuleIsUndefinedException(string message = "Current Module is undefined.")
            : base(message)
        {
        }
    }
}
