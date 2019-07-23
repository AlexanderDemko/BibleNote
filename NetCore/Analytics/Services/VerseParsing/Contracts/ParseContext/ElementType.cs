﻿namespace BibleNote.Analytics.Services.VerseParsing.Contracts.ParseContext
{
    public enum ElementType
    {
        SimpleBlock,                
        HierarchicalBlock,
        ListElement,
        List,
        Title,        
        Table,
        TableBody,
        TableRow,
        TableCell,
        Root        // может быть несколько. Не обязательно корневой элемент.
    }

    public static class ElementTypeHelper
    {
        public static bool IsHierarchical(this ElementType type)
        {
            return type >= ElementType.HierarchicalBlock;
        }

        public static bool IsSimpleHierarchical(this ElementType type)
        {
            return type >= ElementType.HierarchicalBlock && type <= ElementType.List;
        }

        public static bool CanBeLinear(this ElementType type)
        {
            return type <= ElementType.ListElement;
        }
    }
}