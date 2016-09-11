using BibleNote.Analytics.Models.Verse;
using BibleNote.Analytics.Models.VerseParsing;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace BibleNote.Analytics.Contracts.VerseParsing.ParseContext
{
    public interface IDocumentParseContext
    {
        ChapterEntryInfo TitleChapter { get; }

        IParagraphParseContext CurrentParagraph { get; }

        IHierarchyElementParseContext CurrentHierarchy { get; }        
    }   
    
    public interface IDocumentParseContextEditor : IDocumentParseContext
    {
        //CellInfo CurrentCell { get; }  // Если мы находимся в таблице. А уже в CellInfo будет ссылка на текущую таблицу.        

        void SetTitleVerse(ChapterPointer titleChapter);

        void StartParseParagraph();

        void EndParseParagraph(ParagraphParseResult paragraphParseResult);

        void EnterHierarchyElement(ParagraphState paragraphState);

        void ExitHierarchyElement();        
        
        void ClearContext();       
    }
}
