namespace BibleNote.Analytics.Services.ModulesManager.Models.Exceptions
{
    public class VerseNotFoundException : BaseVersePointerException
    {
        public VerseNotFoundException(SimpleVersePointer verse, string moduleShortName, Severity level)
            : base(string.Format("There is no verse '({1}) {0}'", verse, moduleShortName), level)
        {
        }
    }
}
