using BibleNote.Services.VerseParsing.Models;

namespace BibleNote.Services.VerseParsing.Contracts.ParseContext
{
    public interface IElementParseContext
    {
        ElementType ElementType { get; }

        ChapterEntry ChapterEntry { get; }

        ChapterEntry GetHierarchyChapterEntry();

        IElementParseContext PreviousSibling { get; }
    }
}
