using BibleNote.Analytics.Common.Exceptions;

namespace BibleNote.Analytics.Services.ModulesManager.Models.Exceptions
{
    public class BaseVersePointerException : BusinessException
    {
        public enum Severity
        {
            Warning,
            Error
        }

        public Severity Level { get; set; }

        public bool IsChapterException { get; set; }

        public BaseVersePointerException(string message, Severity level)
            : base(message)
        {
            this.Level = level;
        }
    }
}
