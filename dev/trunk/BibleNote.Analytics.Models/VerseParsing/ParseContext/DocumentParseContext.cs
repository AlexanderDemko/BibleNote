using BibleNote.Analytics.Models.Common;
using BibleNote.Analytics.Models.Contracts.ParseContext;
using BibleNote.Analytics.Models.VerseParsing.ParseResult;
using System;

namespace BibleNote.Analytics.Models.VerseParsing.ParseContext
{
    public class DocumentParseContext : IDocumentParseContextEditor
    {
        private int _currentParagraphIndex = -1;

        private IElementParseContext _previousElement;        

        public ChapterEntry TitleChapter { get; private set; }

        public DocumentParseResult DocumentParseResult { get; private set; }

        public IHierarchyParseContext CurrentHierarchy { get; private set; }        

        public IParagraphParseContext CurrentParagraph { get; private set; }

        public IParagraphParseContextEditor CurrentParagraphEditor { get { return (IParagraphParseContextEditor)CurrentParagraph; } }

        public void Init()
        {
            DocumentParseResult = new DocumentParseResult();
        }

        public void SetTitleVerse(ChapterEntry titleChapter)
        {
            TitleChapter = titleChapter;
        }

        public DisposeHandler ParseParagraph()
        {
            CurrentParagraph = new ParagraphParseContext(_previousElement, ++_currentParagraphIndex);            

            return new DisposeHandler(() =>
            {                
                CurrentHierarchy.AddParagraphResult(CurrentParagraph.ParseResult);                   

                _previousElement = CurrentParagraph;
            });
        }

        public void EnterHierarchyElement(ElementType paragraphType)
        {            
            CurrentHierarchy = new HierarchyParseContext(paragraphType, _previousElement, CurrentHierarchy);
            CurrentHierarchy.ParentHierarchy?.ChildHierarchies.Add(CurrentHierarchy);
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

            var valuableHierarchyResult = CurrentHierarchy.ParseResult.GetValuableHierarchyResult();
            _previousElement = CurrentHierarchy;
            CurrentHierarchy = CurrentHierarchy.ParentHierarchy;
            
            if (valuableHierarchyResult != null)
            {
                if (CurrentHierarchy != null)
                {
                    CurrentHierarchy.AddHierarchyResult(valuableHierarchyResult);
                }
                else
                {
                    if (DocumentParseResult.RootHierarchyResult != null)
                        throw new InvalidOperationException("DocumentParseResult.RootHierarchyResult != null");

                    DocumentParseResult.RootHierarchyResult = valuableHierarchyResult;                    
                }
            }                
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
