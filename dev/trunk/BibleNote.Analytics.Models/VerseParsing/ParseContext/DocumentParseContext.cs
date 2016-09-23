using BibleNote.Analytics.Models.Common;
using BibleNote.Analytics.Models.Contracts.ParseContext;

namespace BibleNote.Analytics.Models.VerseParsing.ParseContext
{
    public class DocumentParseContext : IDocumentParseContextEditor
    {
        private IElementParseContext _previousElement;        

        public ChapterEntry TitleChapter { get; private set; }        

        public IHierarchyElementParseContext CurrentHierarchy { get; private set; }        

        public IParagraphParseContext CurrentParagraph { get; private set; }

        public void SetTitleVerse(ChapterEntry titleChapter)
        {
            TitleChapter = titleChapter;
        }

        public DisposeHandler ParseParagraph()
        {
            CurrentParagraph = new ParagraphParseContext(_previousElement);            

            return new DisposeHandler(() =>
            {
                if (CurrentHierarchy != null && CurrentParagraph.ParseResult.IsValuable)                
                    CurrentHierarchy.AddParagraphResult(CurrentParagraph.ParseResult);

                _previousElement = CurrentParagraph;
            });
        }

        public void EnterHierarchyElement(ElementType paragraphType)
        {
            CurrentHierarchy = new HierarchyElementParseContext(paragraphType, _previousElement, CurrentHierarchy);
            _previousElement = null;         // чтобы, когда мы войдём в параграф, у него PreviousSibling был null

            switch (paragraphType)
            {
                case ElementType.ListElement:
                    {
                        if (CurrentHierarchy.ParentHierarchy?.ElementType != ElementType.List)
                            CurrentHierarchy.ChangeElementType(ElementType.SimpleBlock);
                    }
                    break;
                case ElementType.Table:
                    {
                        CurrentHierarchy.HierarchyInfo = new TableHierarchyInfo();
                    }
                    break;
                case ElementType.TableBody:
                    {
                        if (CurrentHierarchy.ParentHierarchy?.ElementType != ElementType.Table)
                            CurrentHierarchy.ChangeElementType(ElementType.SimpleBlock);
                        else
                            CurrentHierarchy.HierarchyInfo = CurrentHierarchy.ParentHierarchy.HierarchyInfo;
                    }
                    break;
                case ElementType.TableRow:
                    {
                        if (CurrentHierarchy.ParentHierarchy?.ElementType == ElementType.Table
                            || CurrentHierarchy.ParentHierarchy?.ElementType == ElementType.TableBody)
                        {
                            var hierarchyInfo = ((TableHierarchyInfo)CurrentHierarchy.ParentHierarchy.HierarchyInfo);
                            hierarchyInfo.CurrentRow++;
                            hierarchyInfo.CurrentColumn = -1;
                        }
                        else
                            CurrentHierarchy.ChangeElementType(ElementType.SimpleBlock);
                    }
                    break;
                case ElementType.TableCell:
                    {
                        if (CurrentHierarchy.ParentHierarchy?.ElementType == ElementType.TableRow)
                            ((TableHierarchyInfo)CurrentHierarchy.ParentHierarchy.ParentHierarchy.HierarchyInfo).CurrentColumn++;
                        else
                            CurrentHierarchy.ChangeElementType(ElementType.SimpleBlock);
                    }
                    break;
            }
        }

        public void ExitHierarchyElement()
        {
            CurrentHierarchy.Parsed = true;

            if (CurrentHierarchy.ElementType == ElementType.TableCell)
            {
                var hierarchyInfo = (TableHierarchyInfo)CurrentHierarchy.ParentHierarchy.ParentHierarchy.HierarchyInfo;                
                if (hierarchyInfo.CurrentRow == 0)                                    
                    hierarchyInfo.FirstRowParseContexts.Add(CurrentHierarchy);                

                if (hierarchyInfo.CurrentColumn == 0)                   
                    hierarchyInfo.FirstColumnParseContexts.Add(CurrentHierarchy);                
            }
            else if (CurrentHierarchy.ElementType == ElementType.Title)
            {   
                SetTitleVerse(CurrentHierarchy.ChapterEntry);
            }

            _previousElement = CurrentHierarchy;            
            CurrentHierarchy = CurrentHierarchy.ParentHierarchy;            
        }
        
        public void ClearContext()
        {
            TitleChapter = null;            
            CurrentParagraph = null;
            CurrentHierarchy = null;
            _previousElement = null;            
        }
    }
}
