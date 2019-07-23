using BibleNote.Analytics.Models.VerseParsing;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace BibleNote.Analytics.Models.Contracts.ParseContext
{
    public interface IElementParseContext
    {
        ElementType ElementType { get; }

        ChapterEntry ChapterEntry { get; }

        ChapterEntry GetHierarchyChapterEntry();

        IElementParseContext PreviousSibling { get; }
    }
}
