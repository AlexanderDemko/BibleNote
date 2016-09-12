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
        void SetTitleVerse(ChapterEntryInfo titleChapter);

        void StartParseParagraph();

        void EndParseParagraph(ParagraphParseResult paragraphParseResult);

        void EnterHierarchyElement(ParagraphState paragraphState);

        void ExitHierarchyElement();        
        
        void ClearContext();       
    }
}
