using BibleNote.Analytics.Common.Helpers;
using System;
using System.Collections.Generic;
using BibleNote.Analytics.Services.VerseParsing.Contracts;
using BibleNote.Analytics.Services.VerseParsing.Models;
using BibleNote.Analytics.Services.VerseParsing.Contracts.ParseContext;
using BibleNote.Analytics.Services.ModulesManager.Models;

namespace BibleNote.Analytics.Services.VerseParsing
{
    class VerseRecognitionService : IVerseRecognitionService
    {
        private IVerseCorrectionService _verseCorrectionService;

        private class RuleList : List<Func<VerseEntry, IDocumentParseContext, bool>> { }

        private static readonly Dictionary<VerseEntryType, RuleList> _funcs = new Dictionary<VerseEntryType, RuleList>()
        {
            { VerseEntryType.BookChapterVerse, new RuleList() { FullVerseRule } },
            { VerseEntryType.BookChapter,      new RuleList() { FullVerseRule } },
            { VerseEntryType.ChapterOrVerse,   new RuleList() { ChapterOrVerseRule } },
            { VerseEntryType.Verse,            new RuleList() { VerseRule } },
            { VerseEntryType.Chapter,          new RuleList() { ChapterRule } },
            { VerseEntryType.ChapterVerse,     new RuleList() { ChapterVerseRule } }
        };

        public VerseRecognitionService(IVerseCorrectionService verseCorrectionService)
        {
            _verseCorrectionService = verseCorrectionService;
        }

        public bool TryRecognizeVerse(VerseEntry verseEntry, IDocumentParseContext docParseContext)
        {
            if (!verseEntry.VersePointerFound)
                return false;

            foreach (var func in _funcs[verseEntry.EntryType])
            {
                if (func(verseEntry, docParseContext))                
                    return _verseCorrectionService.CheckAndCorrectVerse(verseEntry.VersePointer);                
            }

            return false;
        }

        private static bool FullVerseRule(VerseEntry verseEntry, IDocumentParseContext docParseContext)
        {
            return true;
        }

        /// <summary>
        /// Например, ",5-6"
        /// </summary>
        /// <param name="verseEntry"></param>
        /// <param name="docParseContext"></param>
        /// <returns></returns>
        private static bool ChapterOrVerseRule(VerseEntry verseEntry, IDocumentParseContext docParseContext)
        {
            if (docParseContext.CurrentParagraph.LatestVerseEntry != null
                && StringUtils.CheckDivergence(docParseContext.CurrentParagraph.ParseResult.Text, docParseContext.CurrentParagraph.LatestVerseEntry.EndIndex, verseEntry.StartIndex, 2, ','))
            {
                verseEntry.VersePointer.Book = docParseContext.CurrentParagraph.LatestVerseEntry.VersePointer.Book;                
                verseEntry.EntryType = docParseContext.CurrentParagraph.LatestVerseEntry.VersePointer.VerseNumber.IsChapter 
                    ? VerseEntryType.Chapter 
                    : VerseEntryType.Verse;

                if (verseEntry.EntryType == VerseEntryType.Verse)
                {   
                    verseEntry.VersePointer.MoveChapterToVerse(docParseContext.CurrentParagraph.LatestVerseEntry.VersePointer.MostTopChapter);

                    if (verseEntry.VersePointer.Verse <= docParseContext.CurrentParagraph.LatestVerseEntry.VersePointer.MostTopVerse)
                        return false;
                }
                else
                {
                    if (verseEntry.VersePointer.Chapter <= docParseContext.CurrentParagraph.LatestVerseEntry.VersePointer.MostTopChapter)
                        return false;
                }
                                
                return true;
            }

            return false;
        }


        /// <summary>
        /// Например, "5:6"
        /// </summary>
        /// <param name="verseEntry"></param>
        /// <param name="docParseContext"></param>
        /// <returns></returns>
        private static bool ChapterVerseRule(VerseEntry verseEntry, IDocumentParseContext docParseContext)
        {            
            if (docParseContext.CurrentParagraph.LatestVerseEntry != null)
            {
                verseEntry.VersePointer.Book = docParseContext.CurrentParagraph.LatestVerseEntry.VersePointer.Book;
                return true;
            }                        

            return false;
        }

        /// <summary>
        /// Например, ":5"
        /// </summary>
        /// <param name="verseEntry"></param>
        /// <param name="docParseContext"></param>
        /// <returns></returns>
        private static bool VerseRule(VerseEntry verseEntry, IDocumentParseContext docParseContext)
        {
            var parentVerse = docParseContext.CurrentParagraph.LatestVerseEntry?.VersePointer;
            if (parentVerse == null)
            {
                var chapterEntry = docParseContext.CurrentParagraph.GetHierarchyChapterEntry()
                                ?? docParseContext.CurrentHierarchy?.GetHierarchyChapterEntry();

                if (chapterEntry?.Found == true)                
                    parentVerse = chapterEntry.ChapterPointer;
                else if (docParseContext.TitleChapter?.Found == true)
                    parentVerse = docParseContext.TitleChapter.ChapterPointer;
            }               

            if (parentVerse != null && parentVerse.IsMultiVerse <= MultiVerse.OneChapter)
            {
                verseEntry.VersePointer.Book = parentVerse.Book;
                verseEntry.VersePointer.SetChapter(parentVerse.MostTopChapter);
                return true;
            }

            return false;
        }

        /// <summary>
        /// Например, "; 5"
        /// </summary>
        /// <param name="verseEntry"></param>
        /// <param name="docParseContext"></param>
        /// <returns></returns>
        private static bool ChapterRule(VerseEntry verseEntry, IDocumentParseContext docParseContext)
        {
            if (docParseContext.CurrentParagraph.LatestVerseEntry != null)
            {
                verseEntry.VersePointer.Book = docParseContext.CurrentParagraph.LatestVerseEntry.VersePointer.Book;                
                return true;
            }            

            return false;
        }
    }
}
