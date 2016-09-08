using BibleNote.Analytics.Models.Verse;
using System.Collections.Generic;

namespace BibleNote.Analytics.Models.VerseParsing
{
    public interface IHierarchyInfo
    {
    }

    public class TableHierarchyInfo : IHierarchyInfo
    {
        public int CurrentRow { get; set; }

        public int CurrentColumn { get; set; }

        public List<ChapterPointer> FirstRowChapters { get; set; }

        public List<ChapterPointer> FirstColumnChapters { get; set; }

        public TableHierarchyInfo()
        {
            FirstRowChapters = new List<ChapterPointer>();
            FirstColumnChapters = new List<ChapterPointer>();

            CurrentRow = -1;
            CurrentColumn = -1;
        }
    }
}