using BibleNote.Analytics.Models.Contracts;
using BibleNote.Analytics.Models.Contracts.ParseContext;
using BibleNote.Analytics.Models.Verse;
using System.Collections.Generic;

namespace BibleNote.Analytics.Models.VerseParsing
{
    public class TableHierarchyInfo : IHierarchyInfo
    {
        public int CurrentRow { get; set; }

        public int CurrentColumn { get; set; }

        public List<IHierarchyParseContext> FirstRowParseContexts { get; set; }

        public List<IHierarchyParseContext> FirstColumnParseContexts { get; set; }

        public TableHierarchyInfo()
        {
            FirstRowParseContexts = new List<IHierarchyParseContext>();
            FirstColumnParseContexts = new List<IHierarchyParseContext>();

            CurrentRow = -1;
            CurrentColumn = -1;
        }
    }
}