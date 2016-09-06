using BibleNote.Analytics.Models.Common;

namespace BibleNote.Analytics.Models.Common
{
    public enum ParagraphState
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
        public ParagraphState ParagraphState { get; set; }

        public int ParagraphPosition { get; set; }

        public ParagraphParseResult ParentParagraphParseResult { get; set; }
    }
}