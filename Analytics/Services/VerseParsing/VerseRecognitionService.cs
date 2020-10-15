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
                var latestVp = docParseContext.CurrentParagraph.LatestVerseEntry.VersePointer;

                verseEntry.VersePointer.Book = latestVp.Book;
                verseEntry.VersePointer.ModuleShortName = latestVp.ModuleShortName;
                verseEntry.EntryType = latestVp.VerseNumber.IsChapter 
                    ? VerseEntryType.Chapter 
                    : VerseEntryType.Verse;

                var latestTopChapter = string.IsNullOrEmpty(latestVp.ModuleShortName) ? latestVp.MostTopChapter : latestVp.OriginalMostTopChapter;

                if (verseEntry.EntryType == VerseEntryType.Verse)
                {
                    verseEntry.VersePointer.MoveChapterToVerse(latestTopChapter);

                    var latestTopVerse = string.IsNullOrEmpty(latestVp.ModuleShortName) ? latestVp.MostTopVerse : latestVp.OriginalMostTopVerse;
                    if (verseEntry.VersePointer.Verse <= latestTopVerse)
                        return false;
                }
                else
                {
                    if (verseEntry.VersePointer.Chapter <= latestTopChapter)
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
                var latestVp = docParseContext.CurrentParagraph.LatestVerseEntry.VersePointer;
                verseEntry.VersePointer.Book = latestVp.Book;
                verseEntry.VersePointer.ModuleShortName = latestVp.ModuleShortName;
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
            var latestVp = docParseContext.CurrentParagraph.LatestVerseEntry?.VersePointer;
            if (latestVp == null)
            {
                var chapterEntry = docParseContext.CurrentParagraph.GetHierarchyChapterEntry()
                                ?? docParseContext.CurrentHierarchy?.GetHierarchyChapterEntry();

                if (chapterEntry?.Found == true)                
                    latestVp = chapterEntry.ChapterPointer;
                else if (docParseContext.TitleChapter?.Found == true)
                    latestVp = docParseContext.TitleChapter.ChapterPointer;
            }               

            if (latestVp != null && latestVp.IsMultiVerse <= MultiVerse.OneChapter)
            {
                verseEntry.VersePointer.Book = latestVp.Book;
                verseEntry.VersePointer.ModuleShortName = latestVp.ModuleShortName;

                var latestTopChapter = string.IsNullOrEmpty(latestVp.ModuleShortName) ? latestVp.MostTopChapter : latestVp.OriginalMostTopChapter;
                verseEntry.VersePointer.SetChapter(latestTopChapter);
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
                var latestVp = docParseContext.CurrentParagraph.LatestVerseEntry.VersePointer;
                verseEntry.VersePointer.Book = latestVp.Book;
                verseEntry.VersePointer.ModuleShortName = latestVp.ModuleShortName;
                return true;
            }            

            return false;
        }
    }
}
