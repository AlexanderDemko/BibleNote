using System;
using System.Linq;
using BibleNote.Analytics.Contracts.VerseParsing;
using BibleNote.Analytics.Models.Verse;
using BibleNote.Analytics.Models.VerseParsing;
using BibleNote.Analytics.Contracts.VerseParsing.ParseContext;

namespace BibleNote.Analytics.Services.VerseParsing.ParseContext
{
    public class DocumentParseContext : IDocumentParseContextEditor
    {
        public ChapterPointer TitleChapter { get; private set; }        

        public IHierarchyElementParseContext CurrentHierarchy { get; private set; }

        public IParagraphParseContext CurrentParagraph { get; private set; }        

        public void SetTitleVerse(ChapterPointer titleChapter)
        {
            TitleChapter = titleChapter;
        }

        public void StartParseParagraph()
        {
            CurrentParagraph = new ParagraphParseContext();
        }

        public void EndParseParagraph(ParagraphParseResult paragraphParseResult)
        {
            if (CurrentHierarchy != null && paragraphParseResult.IsValuable)
                CurrentHierarchy.ParseResults.Add(paragraphParseResult);
        }

        public void EnterHierarchyElement(ParagraphState paragraphState)
        {
            CurrentHierarchy = new HierarchyElementParseContext(paragraphState, CurrentHierarchy);

            switch (paragraphState)
            {
                case ParagraphState.ListElement:
                    {
                        if (CurrentHierarchy.ParentHierarchy.ParagraphState == ParagraphState.List)
                            CurrentHierarchy.ParentHierarchy.TrySetChapterPointerFromParseResults();
                        else
                            CurrentHierarchy.ParagraphState = ParagraphState.Simple;
                    }
                    break;
                case ParagraphState.Table:
                    {
                        CurrentHierarchy.HierarchyInfo = new TableHierarchyInfo();
                    }
                    break;
                case ParagraphState.TableRow:
                    {
                        if (CurrentHierarchy.ParentHierarchy.ParagraphState == ParagraphState.Table)
                        {
                            var hierarchyInfo = ((TableHierarchyInfo)CurrentHierarchy.ParentHierarchy.HierarchyInfo);
                            hierarchyInfo.CurrentRow++;
                            hierarchyInfo.CurrentColumn = -1;
                        }
                        else
                            CurrentHierarchy.ParagraphState = ParagraphState.Simple;
                    }
                    break;
                case ParagraphState.TableCell:
                    {
                        if (CurrentHierarchy.ParentHierarchy.ParagraphState == ParagraphState.TableRow)
                            ((TableHierarchyInfo)CurrentHierarchy.ParentHierarchy.ParentHierarchy.HierarchyInfo).CurrentColumn++;
                        else
                            CurrentHierarchy.ParagraphState = ParagraphState.Simple;
                    }
                    break;
            }
        }

        public void ExitHierarchyElement()
        {            
            if (CurrentHierarchy.ParagraphState == ParagraphState.TableCell)
            {
                var hierarchyInfo = (TableHierarchyInfo)CurrentHierarchy.ParentHierarchy.ParentHierarchy.HierarchyInfo;                
                if (hierarchyInfo.CurrentRow == 0)
                {
                    CurrentHierarchy.TrySetChapterPointerFromParseResults();                    
                    hierarchyInfo.FirstRowChapters.Add(CurrentHierarchy.ChapterPointer);
                }

                if (hierarchyInfo.CurrentColumn == 0)
                {
                    if (hierarchyInfo.CurrentRow != 0)
                        CurrentHierarchy.TrySetChapterPointerFromParseResults();
                    
                    hierarchyInfo.FirstColumnChapters.Add(CurrentHierarchy.ChapterPointer);
                }
            }
            else if (CurrentHierarchy.ParagraphState == ParagraphState.Title)
            {
                CurrentHierarchy.TrySetChapterPointerFromParseResults();
                if (CurrentHierarchy.ChapterPointer != null)
                    SetTitleVerse(CurrentHierarchy.ChapterPointer);
            }

            CurrentHierarchy = CurrentHierarchy.ParentHierarchy;            
        }
        
        public void ClearContext()
        {
            TitleChapter = null;            
            CurrentParagraph = null;
            CurrentHierarchy = null;
        }
    }
}
