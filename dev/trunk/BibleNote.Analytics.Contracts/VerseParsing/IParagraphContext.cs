using BibleNote.Analytics.Models.Common;

namespace BibleNote.Analytics.Contracts.VerseParsing
{
    public enum ParagraphPosition
    {
        TableHeader = 1,
        TableFirstColumn = 2,
        TableCell = 3,
        ListHeader = 4,
        ListElement = 5,
        SimpleText = 6
    }

    public class ParagraphContext
    {
        public ParagraphPosition ParagraphPosition { get; set; }

        public ParagraphParseResult ParentParagraphParseResult { get; set; }
    }
}