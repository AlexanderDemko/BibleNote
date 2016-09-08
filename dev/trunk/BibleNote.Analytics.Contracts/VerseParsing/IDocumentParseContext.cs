using BibleNote.Analytics.Models.Verse;
using BibleNote.Analytics.Models.VerseParsing;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace BibleNote.Analytics.Contracts.VerseParsing
{
    public interface IDocumentParseContext
    {
        ChapterPointer TitleChapter { get; }

        VerseEntryInfo LatestVerseEntry { get; }

        ParagraphParseResult CurrentParagraph { get; }

        HierarchyContext CurrentHierarchy { get; }

        void SetLatestVerseEntry(VerseEntryInfo verseEntry);

        void SetCurrentParagraphResult(ParagraphParseResult paragraphParseResult);
    }   
    
    public interface IDocumentParseContextEditor : IDocumentParseContext
    {
        //CellInfo CurrentCell { get; }  // Если мы находимся в таблице. А уже в CellInfo будет ссылка на текущую таблицу.

        void SetTitleVerse(ChapterPointer titleChapter);

        void EnterHierarchyElement(ParagraphState paragraphState);

        void ExitHierarchyElement();        

        /// <summary>
        /// For testing purposes
        /// </summary>
        void ClearContext();       
    }
}
