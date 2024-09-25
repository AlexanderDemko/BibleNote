namespace BibleNote.Services.VerseParsing.Contracts.ParseContext
{
    public enum ElementType
    {   
        System,
        SimpleBlock,                
        HierarchicalBlock,
        ListElement,
        List,
        Title,        
        Table,
        TableBody,
        TableRow,
        TableCell,

        /// <summary>
        /// Может быть несколько. Не обязательно корневой элемент всего документа.
        /// </summary>
        Root
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
