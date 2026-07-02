namespace BibleNote.Services.ModulesManager.Models.Exceptions
{
    public class ModuleNotFoundException : NotConfiguredException
    {
        public ModuleNotFoundException(string message)
            : base(message)
        {
        }
    }
}
