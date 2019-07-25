using BibleNote.Analytics.Services.VerseParsing.Models;

namespace BibleNote.Analytics.Services.VerseParsing.Contracts.ParseContext
{
    public interface IElementParseContext
    {
        ElementType ElementType { get; }

        ChapterEntry ChapterEntry { get; }

        ChapterEntry GetHierarchyChapterEntry();

        IElementParseContext PreviousSibling { get; }
    }
}
