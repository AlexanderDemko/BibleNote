using BibleNote.Analytics.Models.VerseParsing;
using BibleNote.Analytics.Models.VerseParsing.ParseResult;

namespace BibleNote.Analytics.Models.Contracts.ParseContext
{
    public interface IParagraphParseContext : IElementParseContext
    {
        ParagraphParseResult ParseResult { get; }

        VerseEntry LatestVerseEntry { get; }
    }

    public interface IParagraphParseContextEditor : IParagraphParseContext
    { 
        void SetLatestVerseEntry(VerseEntry verseEntry);

        void SetParagraphResult(ParagraphParseResult paragraphParseResult);

        void SetParsed();
    }
}
