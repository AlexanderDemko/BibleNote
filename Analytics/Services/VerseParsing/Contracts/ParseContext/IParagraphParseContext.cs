using BibleNote.Analytics.Services.VerseParsing.Models;
using BibleNote.Analytics.Services.VerseParsing.Models.ParseResult;

namespace BibleNote.Analytics.Services.VerseParsing.Contracts.ParseContext
{
    public interface IParagraphParseContext : IElementParseContext
    {
        ParagraphParseResult ParseResult { get; }

        VerseEntry LatestVerseEntry { get; }
    }

    public interface IParagraphParseContextEditor : IParagraphParseContext
    { 
        void SetLatestVerseEntry(VerseEntry verseEntry);        

        void SetParsed();
    }
}
