namespace BibleNote.Analytics.Services.ModulesManager.Models.Exceptions
{
    public class ChapterNotFoundException : BaseVersePointerException
    {
        public ChapterNotFoundException(SimpleVersePointer verse, string moduleShortName, Severity level)
            : base(string.Format("There is no chapter '({2}) {0} {1}'", verse.BookIndex, verse.Chapter, moduleShortName), level)
        {
            this.IsChapterException = true;
        }
    }
}
