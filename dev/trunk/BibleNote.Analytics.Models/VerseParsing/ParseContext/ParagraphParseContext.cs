using BibleNote.Analytics.Models.Contracts.ParseContext;

namespace BibleNote.Analytics.Models.VerseParsing.ParseContext
{
    public class ParagraphParseContext : IParagraphParseContextEditor
    {
        public VerseEntry LatestVerseEntry { get; private set; }

        public ParagraphParseResult ParseResult { get; private set; }

        public IParagraphParseContext PreviousSibling { get; private set; }

        public ParagraphParseContext(IParagraphParseContext previousSibling)
        {
            PreviousSibling = previousSibling;
        }

        public void SetLatestVerseEntry(VerseEntry verseEntry)
        {
            LatestVerseEntry = verseEntry;
        }

        public void SetParagraphResult(ParagraphParseResult paragraphParseResult)
        {
            ParseResult = paragraphParseResult;
        }

        public ChapterEntry GetPreviousChapter()
        {
            if (PreviousSibling == null)
                return null;

            return PreviousSibling.ParseResult.ChapterEntry ?? PreviousSibling.GetPreviousChapter();                            
        }

        public void SetParsed()
        {
            ParseResult.Parsed = true;
        }
    }
}
