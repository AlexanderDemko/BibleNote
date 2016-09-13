using BibleNote.Analytics.Models.Common;
using BibleNote.Analytics.Models.Contracts.ParseContext;

namespace BibleNote.Analytics.Models.VerseParsing.ParseContext
{
    public class DocumentParseContext : IDocumentParseContextEditor
    {
        private IHierarchyElementParseContext _previousHierarchy;

        private IParagraphParseContext _previousParagraphParseContext;

        public ChapterEntry TitleChapter { get; private set; }        

        public IHierarchyElementParseContext CurrentHierarchy { get; private set; }        

        public IParagraphParseContext CurrentParagraph { get; private set; }

        public void SetTitleVerse(ChapterEntry titleChapter)
        {
            TitleChapter = titleChapter;
        }

        public DisposeHandler ParseParagraph()
        {
            CurrentParagraph = new ParagraphParseContext(_previousParagraphParseContext);
            _previousParagraphParseContext = CurrentParagraph;

            return new DisposeHandler(() =>
            {
                if (CurrentHierarchy != null && CurrentParagraph.ParseResult.IsValuable)                
                    CurrentHierarchy.AddParagraphResult(CurrentParagraph.ParseResult);                
            });
        }

        public void EnterHierarchyElement(ParagraphType paragraphType)
        {
            CurrentHierarchy = new HierarchyElementParseContext(paragraphType, CurrentHierarchy) { PreviousSibling = _previousHierarchy };
            _previousHierarchy = null;

            switch (paragraphType)
            {
                case ParagraphType.ListElement:
                    {
                        if (CurrentHierarchy.ParentHierarchy?.ParagraphType != ParagraphType.List)
                            CurrentHierarchy.ParagraphType = ParagraphType.Inline;
                    }
                    break;
                case ParagraphType.Table:
                    {
                        CurrentHierarchy.HierarchyInfo = new TableHierarchyInfo();
                    }
                    break;
                case ParagraphType.TableRow:
                    {
                        if (CurrentHierarchy.ParentHierarchy?.ParagraphType == ParagraphType.Table)
                        {
                            var hierarchyInfo = ((TableHierarchyInfo)CurrentHierarchy.ParentHierarchy.HierarchyInfo);
                            hierarchyInfo.CurrentRow++;
                            hierarchyInfo.CurrentColumn = -1;
                        }
                        else
                            CurrentHierarchy.ParagraphType = ParagraphType.Inline;
                    }
                    break;
                case ParagraphType.TableCell:
                    {
                        if (CurrentHierarchy.ParentHierarchy?.ParagraphType == ParagraphType.TableRow)
                            ((TableHierarchyInfo)CurrentHierarchy.ParentHierarchy.ParentHierarchy.HierarchyInfo).CurrentColumn++;
                        else
                            CurrentHierarchy.ParagraphType = ParagraphType.Inline;
                    }
                    break;
            }
        }

        public void ExitHierarchyElement()
        {
            CurrentHierarchy.Parsed = true;

            if (CurrentHierarchy.ParagraphType == ParagraphType.TableCell)
            {
                var hierarchyInfo = (TableHierarchyInfo)CurrentHierarchy.ParentHierarchy.ParentHierarchy.HierarchyInfo;                
                if (hierarchyInfo.CurrentRow == 0)                                    
                    hierarchyInfo.FirstRowParseContexts.Add(CurrentHierarchy);                

                if (hierarchyInfo.CurrentColumn == 0)                   
                    hierarchyInfo.FirstColumnParseContexts.Add(CurrentHierarchy);                
            }
            else if (CurrentHierarchy.ParagraphType == ParagraphType.Title)
            {   
                SetTitleVerse(CurrentHierarchy.ChapterEntry);
            }

            _previousHierarchy = CurrentHierarchy;
            _previousParagraphParseContext = null;            
            CurrentHierarchy = CurrentHierarchy.ParentHierarchy;            
        }
        
        public void ClearContext()
        {
            TitleChapter = null;            
            CurrentParagraph = null;
            CurrentHierarchy = null;
            _previousHierarchy = null;
            _previousParagraphParseContext = null;
        }
    }
}
