using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace BibleNote.Analytics.Models.Contracts.ParseContext
{
    public enum ElementType
    {
        ListElement,
        SimpleBlock,
        HierarchicalBlock,        
        Title,
        List,
        Table,
        TableBody,
        TableRow,
        TableCell,
        Root
    }

    public static class ElementTypeHelper
    {
        public static bool IsHierarchical(this ElementType type)
        {
            return type > ElementType.SimpleBlock;
        }

        public static bool IsSimpleHierarchical(this ElementType type)
        {
            return type.IsHierarchical() && type < ElementType.List;
        }
    }
}
