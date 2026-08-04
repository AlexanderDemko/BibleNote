using System;
using BibleNote.Services.Contracts;
using BibleNote.Services.VerseParsing.Contracts.ParseContext;
using BibleNote.Services.VerseParsing.Models.ParseResult;
using BibleNote.Services.ModulesManager.Scheme.Module;

namespace BibleNote.Services.VerseParsing.Models.ParseContext
{
    public class DocumentParseContext : IDocumentParseContextEditor
    {
        private int currentParagraphIndex = -1;
        private IElementParseContext previousElement;

        public IDocumentId DocumentId { get; private set; }

        public ChapterEntry TitleChapter { get; private set; }

        public BibleBookInfo DefaultBook { get; private set; }

        public string DefaultBookModuleName { get; private set; }

        public DocumentParseResult DocumentParseResult { get; private set; }

        public IHierarchyParseContext CurrentHierarchy { get; private set; }        

        public IParagraphParseContext CurrentParagraph { get; private set; }

        public IParagraphParseContextEditor CurrentParagraphEditor => (IParagraphParseContextEditor)CurrentParagraph;

        public void Init(IDocumentId documentId)
        {
            DocumentId = documentId;
            DocumentParseResult = new DocumentParseResult();
        }

        public void SetTitleVerse(ChapterEntry titleChapter)
        {
            TitleChapter = titleChapter;
        }

        public void SetDefaultBook(BibleBookInfo book, string moduleName)
        {
            DefaultBook = book;
            DefaultBookModuleName = moduleName;
        }

        public DisposeHandler ParseParagraph()
        {
            CurrentParagraph = new ParagraphParseContext(previousElement, ++currentParagraphIndex);            

            return new DisposeHandler(() =>
            {                
                CurrentHierarchy.AddParagraphResult(CurrentParagraph.ParseResult);                   

                previousElement = CurrentParagraph;
            });
        }

        public void EnterHierarchyElement(ElementType paragraphType)
        {            
            CurrentHierarchy = new HierarchyParseContext(paragraphType, previousElement, CurrentHierarchy);
            CurrentHierarchy.ParentHierarchy?.ChildHierarchies.Add(CurrentHierarchy);
            previousElement = null;         // чтобы когда мы войдём в параграф, у него PreviousSibling был null

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

            var structuralHierarchyResult = CurrentHierarchy.ParseResult;
            var valuableHierarchyResult = structuralHierarchyResult.GetValuableHierarchyResult();
            previousElement = CurrentHierarchy;
            CurrentHierarchy = CurrentHierarchy.ParentHierarchy;

            if (CurrentHierarchy != null)
            {
                CurrentHierarchy.AddStructuralHierarchyResult(structuralHierarchyResult);
                if (valuableHierarchyResult != null)
                    CurrentHierarchy.AddHierarchyResult(valuableHierarchyResult);
            }
            else
            {
                if (DocumentParseResult.StructureRootHierarchyResult != null)
                    throw new InvalidOperationException("DocumentParseResult.StructureRootHierarchyResult != null");

                DocumentParseResult.StructureRootHierarchyResult = structuralHierarchyResult;
                DocumentParseResult.RootHierarchyResult = valuableHierarchyResult;
            }
        }

        public void ClearContext()
        {
            TitleChapter = null;
            DefaultBook = null;
            DefaultBookModuleName = null;
            CurrentParagraph = null;
            CurrentHierarchy = null;
            previousElement = null;
        }
    }
}
