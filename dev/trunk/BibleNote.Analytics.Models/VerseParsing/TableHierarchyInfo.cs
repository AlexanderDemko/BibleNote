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

        public List<IHierarchyElementParseContext> FirstRowParseContexts { get; set; }

        public List<IHierarchyElementParseContext> FirstColumnParseContexts { get; set; }

        public TableHierarchyInfo()
        {
            FirstRowParseContexts = new List<IHierarchyElementParseContext>();
            FirstColumnParseContexts = new List<IHierarchyElementParseContext>();

            CurrentRow = -1;
            CurrentColumn = -1;
        }
    }
}