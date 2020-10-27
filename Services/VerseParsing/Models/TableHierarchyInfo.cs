using System.Collections.Generic;
using BibleNote.Services.VerseParsing.Contracts.ParseContext;

namespace BibleNote.Services.VerseParsing.Models
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