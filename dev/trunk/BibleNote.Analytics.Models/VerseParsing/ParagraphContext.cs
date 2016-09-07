
namespace BibleNote.Analytics.Models.VerseParsing
{
    public enum ParagraphState
    {
        Title = 1,
        TableHeader = 2,
        TableFirstColumn = 3,
        TableCell = 4,
        ListHeader = 5,
        ListElement = 6,
        SimpleText = 7
    }

    public class ParagraphContext
    {
        public ParagraphState ParagraphState { get; set; }

        public int ParagraphPosition { get; set; }

        public ParagraphParseResult ParentParagraphParseResult { get; set; }
    }
}