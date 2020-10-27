using BibleNote.Services.VerseParsing.Models;
using BibleNote.Services.VerseParsing.Models.ParseResult;

namespace BibleNote.Services.VerseParsing.Contracts.ParseContext
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
