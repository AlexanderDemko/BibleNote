using BibleNote.Analytics.Models.Common;
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

        ParagraphParseResult CurrentParagraph { get; }

        //CellInfo CurrentCell { get; }  // Если мы находимсяв таблице. А уже в CellInfo будет ссылка на текущую таблицу.

        void SetTitleVerse(VersePointer versePointer);

        void SetLatestVerseEntry(VerseEntryInfo verseEntry);

        void SetCurrentParagraph(ParagraphParseResult paragraph);

        void EnterTable();

        void EnterCell();

        /// <summary>
        /// For testing purposes
        /// </summary>
        void ClearContext();        
    }
}
