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
        VersePointer TitleVerse { get; }

        VerseEntryInfo LatestVerseEntry { get; }

        ParagraphContext CurrentParagraph { get; }

        //CellInfo CurrentCell { get; }  // Если мы находимсяв таблице. А уже в CellInfo будет ссылка на текущую таблицу.

        void SetTitleVerse(VersePointer versePointer);

        void SetLatestVerseEntry(VerseEntryInfo verseEntry);

        void SetCurrentParagraph(ParagraphContext paragraphContext);

        void SetCurrentParagraphParseResult(ParagraphParseResult paragraphParseResult);

        void EnterElement(ParagraphState paragraphState);

        void ExitElement();        

        /// <summary>
        /// For testing purposes
        /// </summary>
        void ClearContext();       
    }
}
