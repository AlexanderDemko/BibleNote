using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Net;
using System.Text.RegularExpressions;
using BibleNote.Domain.Enums;
using BibleNote.Providers.Html;
using BibleNote.Services.Configuration.Contracts;
using BibleNote.Services.Contracts;
using BibleNote.Services.ModulesManager.Contracts;
using BibleNote.Services.ModulesManager.Models;
using BibleNote.Services.ModulesManager.Scheme.Module;
using BibleNote.Services.ModulesManager.Scheme.ZefaniaXml;
using BibleNote.Services.ParallelVerses.Contracts;
using BibleNote.Services.VerseParsing;
using BibleNote.Services.VerseParsing.Contracts;
using BibleNote.Services.VerseParsing.Contracts.ParseContext;
using BibleNote.Services.VerseParsing.Models;
using BibleNote.Services.VerseParsing.Models.ParseResult;
using BibleNote.Services.VerseProcessing;
using BibleNote.Services.VerseProcessing.Models;
using HtmlAgilityPack;
using Microsoft.AspNetCore.Mvc;

namespace BibleNote.Application.Controllers
{
    public class VerseParsingController : BaseController
    {
        private const int MaxParsePageRelations = 50000;

        private readonly IDocumentParserFactory documentParserFactory;
        private readonly IVerseLinkService verseLinkService;
        private readonly IConfigurationManager configurationManager;
        private readonly IApplicationManager applicationManager;
        private readonly IModulesManager modulesManager;
        private readonly IBibleParallelTranslationConnectorManager parallelTranslationConnector;

        public VerseParsingController(
            IDocumentParserFactory documentParserFactory,
            IVerseLinkService verseLinkService,
            IConfigurationManager configurationManager,
            IApplicationManager applicationManager,
            IModulesManager modulesManager,
            IBibleParallelTranslationConnectorManager parallelTranslationConnector)
        {
            this.documentParserFactory = documentParserFactory;
            this.verseLinkService = verseLinkService;
            this.configurationManager = configurationManager;
            this.applicationManager = applicationManager;
            this.modulesManager = modulesManager;
            this.parallelTranslationConnector = parallelTranslationConnector;
        }

        [HttpGet]
        public ActionResult<VerseParsingHealthResponse> Health()
        {
            var module = applicationManager.CurrentModuleInfo;
            return new VerseParsingHealthResponse
            {
                Status = "ok",
                Module = module.ShortName,
                ModuleName = module.DisplayName,
                UseCommaDelimiter = configurationManager.UseCommaDelimiter,
                ModulesDirectory = modulesManager.GetModulesDirectory()
            };
        }

        [HttpGet]
        public ActionResult<List<ModuleResponse>> Modules()
        {
            var currentModule = configurationManager.ModuleShortName;
            return modulesManager.GetModules(true)
                .OrderBy(module => module.DisplayName)
                .ThenBy(module => module.ShortName)
                .Select(module => new ModuleResponse
                {
                    ShortName = module.ShortName,
                    DisplayName = module.DisplayName,
                    Type = module.Type.ToString(),
                    Locale = module.Locale,
                    Description = module.Description,
                    IsCurrent = string.Equals(module.ShortName, currentModule, StringComparison.OrdinalIgnoreCase)
                })
                .ToList();
        }

        [HttpGet]
        public ActionResult<List<BibleBookResponse>> Books([FromQuery] string module)
        {
            var moduleShortName = string.IsNullOrWhiteSpace(module)
                ? configurationManager.ModuleShortName
                : module.Trim();
            if (string.IsNullOrWhiteSpace(moduleShortName))
                moduleShortName = "rst";

            var bible = applicationManager.GetBibleContent(moduleShortName);
            var moduleInfo = modulesManager.GetModuleInfo(moduleShortName);
            return bible.Books
                .OrderBy(book => book.Index)
                .Select(book =>
                {
                    var bookInfo = moduleInfo.BibleStructure.BibleBooks.FirstOrDefault(item => item.Index == book.Index);
                    var name = bookInfo?.Name ?? book.bname;
                    var shortName = bookInfo?.FriendlyShortName ?? book.bsname ?? name;
                    return new BibleBookResponse
                    {
                        Index = book.Index,
                        Name = name,
                        ShortName = shortName,
                        ChapterCount = book.Chapters.Count,
                        Chapters = book.Chapters.Select(chapter => chapter.Index).OrderBy(index => index).ToList()
                    };
                })
                .ToList();
        }

        [HttpGet]
        public ActionResult<List<BibleTextSearchResponse>> SearchText([FromQuery] BibleTextSearchRequest request)
        {
            if (request == null || string.IsNullOrWhiteSpace(request.Query))
                return BadRequest("query is required.");

            var mode = string.IsNullOrWhiteSpace(request.Mode) ? "and" : request.Mode.Trim().ToLowerInvariant();
            if (mode != "and" && mode != "phrase" && mode != "regex")
                return BadRequest("mode must be 'and', 'phrase', or 'regex'.");

            var module = string.IsNullOrWhiteSpace(request.Module)
                ? configurationManager.ModuleShortName
                : request.Module.Trim();
            if (string.IsNullOrWhiteSpace(module))
                module = "rst";

            var limit = Math.Max(1, Math.Min(request.Limit > 0 ? request.Limit : 80, 200));
            var query = WebUtility.HtmlDecode(request.Query.Trim());
            var comparison = request.CaseSensitive ? StringComparison.Ordinal : StringComparison.OrdinalIgnoreCase;
            var terms = query
                .Split((char[])null, StringSplitOptions.RemoveEmptyEntries)
                .Where(term => term.Length > 1)
                .Distinct(request.CaseSensitive ? StringComparer.Ordinal : StringComparer.OrdinalIgnoreCase)
                .ToArray();
            Regex regex = null;
            if (mode == "regex")
            {
                try
                {
                    regex = new Regex(
                        query,
                        RegexOptions.CultureInvariant | (request.CaseSensitive ? RegexOptions.None : RegexOptions.IgnoreCase),
                        TimeSpan.FromMilliseconds(100));
                }
                catch (ArgumentException error)
                {
                    return BadRequest($"Invalid regular expression: {error.Message}");
                }
            }

            var bible = applicationManager.GetBibleContent(module);
            var moduleInfo = modulesManager.GetModuleInfo(module);
            var results = new List<BibleTextSearchResponse>();
            try
            {
                foreach (var book in bible.Books.OrderBy(item => item.Index))
                {
                    var bookInfo = moduleInfo.BibleStructure.BibleBooks.FirstOrDefault(item => item.Index == book.Index);
                    var bookName = bookInfo?.Name ?? book.bname;
                    var bookShortName = bookInfo?.FriendlyShortName ?? book.bsname ?? bookName;
                    foreach (var chapter in book.Chapters.OrderBy(item => item.Index))
                    {
                        foreach (var verse in chapter.Verses.OrderBy(item => item.Index))
                        {
                            var text = WebUtility.HtmlDecode(verse.Value ?? string.Empty)
                                .Replace("|", string.Empty)
                                .Trim();
                            if (text.Length == 0)
                                continue;

                            var score = BibleTextSearchScore(text, query, terms, mode, comparison, regex);
                            if (score < 0)
                                continue;

                            results.Add(new BibleTextSearchResponse
                            {
                                Module = module,
                                ModuleName = moduleInfo.DisplayName,
                                BookIndex = book.Index,
                                BookName = bookName,
                                BookShortName = bookShortName,
                                Chapter = chapter.Index,
                                Verse = verse.Index,
                                TopVerse = verse.TopIndex,
                                Reference = $"{bookShortName} {chapter.Index}:{verse.Index}",
                                Text = text,
                                Score = score,
                                Weight = BibleTextSearchWeight(score)
                            });
                        }
                    }
                }
            }
            catch (RegexMatchTimeoutException)
            {
                return BadRequest("The regular expression took too long to evaluate.");
            }

            return results
                .OrderByDescending(item => item.Score)
                .ThenBy(item => item.BookIndex)
                .ThenBy(item => item.Chapter)
                .ThenBy(item => item.Verse)
                .Take(limit)
                .ToList();
        }

        private static int BibleTextSearchScore(
            string text,
            string query,
            string[] terms,
            string mode,
            StringComparison comparison,
            Regex regex)
        {
            if (mode == "regex")
                return regex.IsMatch(text) ? 1000 : -1;

            var phraseIndex = text.IndexOf(query, comparison);
            if (mode == "phrase")
                return phraseIndex >= 0 ? 2000 - Math.Min(phraseIndex, 1000) : -1;
            if (phraseIndex >= 0)
                return 3000 - Math.Min(phraseIndex, 1000);
            if (terms.Length == 0)
                return -1;

            var termPositions = terms.Select(term => text.IndexOf(term, comparison)).ToArray();
            var matchedTerms = termPositions.Count(position => position >= 0);
            var requiredTerms = terms.Length <= 2 ? terms.Length : (int)Math.Ceiling(terms.Length * 0.6);
            if (matchedTerms < requiredTerms)
                return -1;

            var orderedPairs = 0;
            for (var index = 1; index < termPositions.Length; index++)
            {
                if (termPositions[index - 1] >= 0 && termPositions[index] > termPositions[index - 1])
                    orderedPairs++;
            }
            var matchedPositions = termPositions.Where(position => position >= 0).ToArray();
            var span = matchedPositions.Length > 1 ? matchedPositions.Max() - matchedPositions.Min() : 200;
            var coverage = (double)matchedTerms / terms.Length;
            var order = terms.Length > 1 ? (double)orderedPairs / (terms.Length - 1) : 1;
            var proximity = Math.Max(0, 1 - Math.Min(span, 200) / 200.0);
            var weight = Math.Min(0.99, coverage * 0.7 + order * 0.2 + proximity * 0.1);
            return (int)Math.Round(weight * 1800);
        }

        private static double BibleTextSearchWeight(int score)
        {
            if (score >= 2000)
                return 1;

            return Math.Min(0.99, Math.Round(score / 1800.0, 4));
        }

        [HttpPost]
        public ActionResult<UploadModuleResponse> UploadModule([FromBody] UploadModuleRequest request)
        {
            if (request == null)
                return BadRequest("Request body is required.");

            if (string.IsNullOrWhiteSpace(request.FilePath))
                return BadRequest("filePath is required.");

            if (!System.IO.File.Exists(request.FilePath))
                return NotFound($"Module file '{request.FilePath}' was not found.");

            var moduleName = string.IsNullOrWhiteSpace(request.ModuleName)
                ? Path.GetFileNameWithoutExtension(request.FilePath)
                : request.ModuleName.Trim();
            if (string.IsNullOrWhiteSpace(moduleName))
                return BadRequest("moduleName is required.");

            if (moduleName.IndexOfAny(Path.GetInvalidFileNameChars()) >= 0)
                return BadRequest("moduleName contains invalid file name characters.");

            try
            {
                var module = modulesManager.UploadModule(request.FilePath, moduleName);
                applicationManager.ReloadInfo();
                return new UploadModuleResponse
                {
                    ShortName = module.ShortName,
                    DisplayName = module.DisplayName,
                    Type = module.Type.ToString(),
                    ModulesDirectory = modulesManager.GetModulesDirectory()
                };
            }
            catch (Exception ex)
            {
                return BadRequest(ex.Message);
            }
        }

        [HttpPost]
        public ActionResult<ParsePageResponse> ParsePage([FromBody] ParsePageRequest request)
        {
            if (request == null)
                return BadRequest("Request body is required.");

            var module = string.IsNullOrWhiteSpace(request.Module)
                ? configurationManager.ModuleShortName
                : request.Module.Trim();
            if (string.IsNullOrWhiteSpace(module))
                module = "rst";

            using (configurationManager.UseTemporarySettings(module, request.UseCommaDelimiter))
            {
                var updateHtml = request.UpdateHtml == true && !string.IsNullOrWhiteSpace(request.Html);
                var documentId = new ParserDocumentId(0, !updateHtml);
                var provider = new ReadOnlyDocumentProviderInfo(verseLinkService, !updateHtml);
                var paragraphs = new List<ParagraphParseResult>();
                DocumentParseResult documentParseResult;
                string updatedHtml = null;

                using (var parser = documentParserFactory.Create(provider, documentId))
                {
                    var defaultBook = TryGetTitleBook(request.Title);
                    if (defaultBook != null)
                        parser.SetDefaultBook(defaultBook.BibleBook, defaultBook.ModuleName);

                    if (!string.IsNullOrWhiteSpace(request.Html))
                    {
                        updatedHtml = ParseHtml(parser, request.Html, paragraphs, updateHtml);
                    }
                    else
                    {
                        if (!string.IsNullOrWhiteSpace(request.Title))
                        {
                            using (parser.ParseHierarchyElement(ElementType.Title))
                            {
                                ParseTextParagraph(parser, request.Title, paragraphs);
                            }
                        }

                        var requestParagraphs = request.Paragraphs?.Where(p => p != null).ToList();
                        if (requestParagraphs?.Count > 0)
                        {
                            foreach (var paragraph in requestParagraphs)
                            {
                                if (!string.IsNullOrEmpty(paragraph.Html))
                                    ParseParagraph(parser, paragraph.Html, paragraphs);
                                else
                                    ParseTextParagraph(parser, paragraph.Text ?? string.Empty, paragraphs);
                            }
                        }
                        else if (!string.IsNullOrWhiteSpace(request.Text))
                        {
                            foreach (var paragraph in SplitTextParagraphs(request.Text))
                                ParseTextParagraph(parser, paragraph, paragraphs);
                        }
                        else
                        {
                            return BadRequest("Specify html, text, or paragraphs.");
                        }
                    }

                    documentParseResult = parser.DocumentParseResult;
                }

                // The document's outer hierarchy is finalized when the parser is disposed.
                // Calculating inside the using block sees no root hierarchy and silently
                // returns an empty relation set even though references were recognized.
                var relationCalculation = VerseRelationsCalculator.Calculate(
                    documentParseResult,
                    MaxParsePageRelations);

                return new ParsePageResponse
                {
                    PageId = request.PageId,
                    Module = applicationManager.CurrentModuleInfo.ShortName,
                    UseCommaDelimiter = configurationManager.UseCommaDelimiter,
                    Html = updateHtml ? updatedHtml : null,
                    Paragraphs = paragraphs.Select(ToParagraphResponse).ToList(),
                    Relations = relationCalculation.Relations.Select(ToRelationResponse).ToList(),
                    RelationsCapped = relationCalculation.Capped
                };
            }
        }

        private Abbreviation TryGetTitleBook(string title)
        {
            if (string.IsNullOrWhiteSpace(title))
                return null;

            var matches = applicationManager.CurrentModuleInfo.BibleStructure.AllAbbreviations.Values
                .Where(abbreviation => abbreviation.IsFullBookName
                    && TitleContainsBookName(title, abbreviation.Value))
                .GroupBy(abbreviation => abbreviation.BibleBook.Index)
                .Select(group => group.OrderByDescending(abbreviation => abbreviation.Value.Length).First())
                .ToList();

            return matches.Count == 1 ? matches[0] : null;
        }

        private static bool TitleContainsBookName(string title, string bookName)
        {
            var words = Regex.Split(bookName.Trim(), @"\s+")
                .Where(word => word.Length > 0)
                .Select(Regex.Escape);
            var pattern = @"(?<![\p{L}\p{N}])" + string.Join(@"\s+", words) + @"(?![\p{L}\p{N}])";
            return Regex.IsMatch(title, pattern, RegexOptions.IgnoreCase | RegexOptions.CultureInvariant);
        }

        [HttpGet]
        public ActionResult<VerseTextResponse> VerseText([FromQuery] VerseTextRequest request)
        {
            if (request == null)
                return BadRequest("Request query is required.");

            if (request.BookIndex < 1 || request.Chapter < 1 || request.Verse < 0)
                return BadRequest("bookIndex and chapter must be positive integers. verse must be omitted or positive.");

            var module = string.IsNullOrWhiteSpace(request.Module)
                ? configurationManager.ModuleShortName
                : request.Module.Trim();
            if (string.IsNullOrWhiteSpace(module))
                module = "rst";

            var bible = applicationManager.GetBibleContent(module);
            var moduleInfo = modulesManager.GetModuleInfo(module);
            if (!TryResolveVerseTextBook(bible, moduleInfo, request, out var book, out var bookInfo))
                return NotFound($"Book {request.BookIndex} was not found in module '{module}'.");

            request.BookIndex = book.Index;
            var bookName = bookInfo?.Name ?? book.bname;
            var bookShortName = bookInfo?.FriendlyShortName ?? book.bsname ?? bookName;
            var verses = GetVerseTexts(book, module, request);
            if (verses.Count == 0)
                return NotFound("Verse text was not found.");

            return new VerseTextResponse
            {
                Module = module,
                ModuleName = moduleInfo.DisplayName,
                BookIndex = book.Index,
                BookName = bookName,
                BookShortName = bookShortName,
                Chapter = request.Chapter,
                Verse = request.Verse,
                TopChapter = request.TopChapter,
                TopVerse = request.TopVerse,
                Reference = FormatReference(bookShortName, request),
                Text = string.Join(Environment.NewLine, verses.Select(item => $"{item.Reference} {item.Text}")),
                Verses = verses
            };
        }

        [HttpGet]
        public ActionResult<ParallelVerseTextResponse> ParallelVerseText([FromQuery] ParallelVerseTextRequest request)
        {
            if (request == null)
                return BadRequest("Request query is required.");

            if (request.BookIndex < 1 || request.Chapter < 1)
                return BadRequest("bookIndex and chapter must be positive integers.");

            var baseModule = string.IsNullOrWhiteSpace(request.BaseModule)
                ? configurationManager.ModuleShortName
                : request.BaseModule.Trim();
            var module = string.IsNullOrWhiteSpace(request.Module)
                ? configurationManager.ModuleShortName
                : request.Module.Trim();
            if (string.IsNullOrWhiteSpace(baseModule))
                baseModule = "rst";
            if (string.IsNullOrWhiteSpace(module))
                module = "rst";

            var baseBible = applicationManager.GetBibleContent(baseModule);
            if (!baseBible.BooksDictionary.TryGetValue(request.BookIndex, out var baseBook))
                return NotFound($"Book {request.BookIndex} was not found in module '{baseModule}'.");

            var baseChapter = baseBook.Chapters.FirstOrDefault(item => item.Index == request.Chapter);
            if (baseChapter == null)
                return NotFound($"Chapter {request.Chapter} was not found in module '{baseModule}'.");

            var targetBible = applicationManager.GetBibleContent(module);
            var targetModuleInfo = modulesManager.GetModuleInfo(module);
            var parallelInfo = parallelTranslationConnector.GetParallelBibleInfo(baseModule, module);
            parallelInfo.TryGetValue(request.BookIndex, out var comparisonTable);

            var rows = new List<ParallelVerseTextRowResponse>();
            foreach (var baseVerse in baseChapter.Verses)
            {
                var basePointer = new ModuleVersePointer(request.BookIndex, request.Chapter, baseVerse.Index);
                var targetPointers = comparisonTable != null
                    && comparisonTable.TryGetValue(basePointer, out var mappedPointers)
                        ? mappedPointers
                        : new List<ModuleVersePointer> { (ModuleVersePointer)basePointer.Clone() };
                var targetVerses = new List<VerseTextItemResponse>();

                foreach (var targetPointer in targetPointers)
                {
                    if (targetPointer.IsEmpty)
                    {
                        targetVerses.Add(new VerseTextItemResponse
                        {
                            Chapter = targetPointer.Chapter,
                            Verse = targetPointer.Verse,
                            TopVerse = targetPointer.TopVerse,
                            Reference = FormatPointerReference(targetPointer),
                            PartIndex = targetPointer.PartIndex,
                            IsEmpty = true,
                            IsPartOfBigVerse = targetPointer.IsPartOfBigVerse,
                            HasValueEvenIfEmpty = targetPointer.HasValueEvenIfEmpty
                        });
                        continue;
                    }

                    if (!targetBible.BooksDictionary.TryGetValue(targetPointer.BookIndex, out var targetBook))
                        continue;

                    var item = GetParallelVerseText(targetBook, module, targetPointer);
                    if (item != null)
                        targetVerses.Add(item);
                }

                rows.Add(new ParallelVerseTextRowResponse
                {
                    BaseChapter = request.Chapter,
                    BaseVerse = baseVerse.Index,
                    Verses = targetVerses
                });
            }

            return new ParallelVerseTextResponse
            {
                BaseModule = baseModule,
                Module = module,
                ModuleName = targetModuleInfo.DisplayName,
                Rows = rows
            };
        }

        private static VerseTextItemResponse GetParallelVerseText(BIBLEBOOK book, string module, ModuleVersePointer pointer)
        {
            try
            {
                var text = book.GetVerseContent(
                    pointer,
                    module,
                    string.Empty,
                    true,
                    out var verseIndex,
                    out var isEmpty,
                    out var isFullVerse,
                    out var isPartOfBigVerse,
                    out var hasValueEvenIfEmpty);

                return new VerseTextItemResponse
                {
                    Chapter = pointer.Chapter,
                    Verse = verseIndex.Index,
                    TopVerse = verseIndex.TopIndex,
                    Reference = verseIndex.TopIndex.HasValue
                        ? $"{pointer.Chapter}:{verseIndex.Index}-{verseIndex.TopIndex.Value}"
                        : $"{pointer.Chapter}:{verseIndex.Index}",
                    Text = WebUtility.HtmlDecode(text),
                    IsFullVerse = isFullVerse,
                    IsPartOfBigVerse = isPartOfBigVerse || pointer.IsPartOfBigVerse,
                    HasValueEvenIfEmpty = hasValueEvenIfEmpty || pointer.HasValueEvenIfEmpty,
                    PartIndex = pointer.PartIndex,
                    IsEmpty = isEmpty
                };
            }
            catch
            {
                return null;
            }
        }

        private static string FormatPointerReference(ModuleVersePointer pointer)
        {
            return pointer.TopVerse.HasValue
                ? $"{pointer.Chapter}:{pointer.Verse}-{pointer.TopVerse.Value}"
                : $"{pointer.Chapter}:{pointer.Verse}";
        }

        private static bool TryResolveVerseTextBook(XMLBIBLE bible, ModuleInfo moduleInfo, VerseTextRequest request, out BIBLEBOOK book, out BibleBookInfo bookInfo)
        {
            if (bible.BooksDictionary.TryGetValue(request.BookIndex, out book))
            {
                var bookIndex = book.Index;
                bookInfo = moduleInfo.BibleStructure.BibleBooks.FirstOrDefault(item => item.Index == bookIndex);
                return true;
            }

            var candidates = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            AddBookLookupCandidate(candidates, request.BookName);
            AddBookLookupCandidate(candidates, request.BookShortName);
            AddBookLookupCandidate(candidates, ExtractBookNameCandidate(request.OriginalText));

            foreach (var item in moduleInfo.BibleStructure.BibleBooks)
            {
                if (!BookMatches(item, candidates))
                    continue;

                if (bible.BooksDictionary.TryGetValue(item.Index, out book))
                {
                    bookInfo = item;
                    return true;
                }
            }

            foreach (var item in bible.BooksDictionary.Values)
            {
                if (!candidates.Contains(NormalizeBookLookupKey(item.bname))
                    && !candidates.Contains(NormalizeBookLookupKey(item.bsname)))
                    continue;

                book = item;
                var bookIndex = item.Index;
                bookInfo = moduleInfo.BibleStructure.BibleBooks.FirstOrDefault(info => info.Index == bookIndex);
                return true;
            }

            book = null;
            bookInfo = null;
            return false;
        }

        private static bool BookMatches(BibleBookInfo bookInfo, HashSet<string> candidates)
        {
            if (bookInfo == null || candidates.Count == 0)
                return false;

            if (candidates.Contains(NormalizeBookLookupKey(bookInfo.Name))
                || candidates.Contains(NormalizeBookLookupKey(bookInfo.ShortName))
                || candidates.Contains(NormalizeBookLookupKey(bookInfo.FriendlyShortName)))
                return true;

            return bookInfo.Abbreviations?.Any(item => candidates.Contains(NormalizeBookLookupKey(item.Value))) == true;
        }

        private static string ExtractBookNameCandidate(string value)
        {
            if (string.IsNullOrWhiteSpace(value))
                return value;

            var trimmed = value.Trim();
            var colonIndex = trimmed.IndexOf(':');
            if (colonIndex <= 0)
                return trimmed;

            var prefix = trimmed.Substring(0, colonIndex).TrimEnd();
            while (prefix.Length > 0 && char.IsDigit(prefix[prefix.Length - 1]))
                prefix = prefix.Substring(0, prefix.Length - 1).TrimEnd();
            return prefix;
        }

        private static void AddBookLookupCandidate(HashSet<string> candidates, string value)
        {
            var normalized = NormalizeBookLookupKey(value);
            if (!string.IsNullOrWhiteSpace(normalized))
                candidates.Add(normalized);
        }

        private static string NormalizeBookLookupKey(string value)
        {
            if (string.IsNullOrWhiteSpace(value))
                return string.Empty;

            var chars = new List<char>(value.Length);
            foreach (var raw in value.Trim().ToLowerInvariant())
            {
                if (!char.IsLetterOrDigit(raw))
                    continue;

                if ((raw == 'е' || raw == 'я') && chars.Count > 0 && char.IsDigit(chars[chars.Count - 1]))
                    continue;

                chars.Add(raw);
            }
            return new string(chars.ToArray());
        }

        private static List<VerseTextItemResponse> GetVerseTexts(BIBLEBOOK book, string module, VerseTextRequest request)
        {
            var result = new List<VerseTextItemResponse>();
            var topChapter = request.TopChapter.GetValueOrDefault(request.Chapter);
            if (request.ContextVerses > 0 && request.Verse > 0)
            {
                var context = Math.Min(request.ContextVerses, 100);
                var fromVerse = Math.Max(1, request.Verse - context);
                var chapterInfo = book.Chapters.FirstOrDefault(item => item.Index == request.Chapter);
                var toVerse = Math.Min(chapterInfo?.Verses.LastOrDefault()?.Index ?? request.Verse, request.Verse + context);
                for (var verse = fromVerse; verse <= toVerse; verse++)
                    AddVerseText(book, module, request.Chapter, verse, result);
                return result;
            }
            if (topChapter < request.Chapter)
                return result;

            var hasVerse = request.Verse > 0;
            if (!hasVerse)
            {
                AddChapterVerses(book, module, request.Chapter, result);
                return result;
            }

            for (var chapter = request.Chapter; chapter <= topChapter; chapter++)
            {
                var chapterInfo = book.Chapters.FirstOrDefault(item => item.Index == chapter);
                if (chapterInfo == null)
                    continue;

                var firstVerse = chapter == request.Chapter ? request.Verse : 1;
                var lastVerse = chapter == topChapter
                    ? request.TopVerse.GetValueOrDefault(chapter == request.Chapter ? request.Verse : chapterInfo.Verses.LastOrDefault()?.Index ?? 0)
                    : chapterInfo.Verses.LastOrDefault()?.Index ?? 0;

                for (var verse = firstVerse; verse <= lastVerse; verse++)
                    AddVerseText(book, module, chapter, verse, result);
            }

            return result;
        }

        private static void AddChapterVerses(BIBLEBOOK book, string module, int chapter, List<VerseTextItemResponse> result)
        {
            var chapterInfo = book.Chapters.FirstOrDefault(item => item.Index == chapter);
            if (chapterInfo == null)
                return;

            foreach (var verse in chapterInfo.Verses)
                AddVerseText(book, module, chapter, verse.Index, result);
        }

        private static void AddVerseText(BIBLEBOOK book, string module, int chapter, int verse, List<VerseTextItemResponse> result)
        {
            try
            {
                var pointer = new ModuleVersePointer(book.Index, chapter, verse);
                var text = book.GetVerseContent(
                    pointer,
                    module,
                    string.Empty,
                    false,
                    out var verseIndex,
                    out var isEmpty,
                    out var isFullVerse,
                    out var isPartOfBigVerse,
                    out var hasValueEvenIfEmpty);

                if (text == null || isEmpty)
                    return;

                result.Add(new VerseTextItemResponse
                {
                    Chapter = chapter,
                    Verse = verse,
                    TopVerse = verseIndex.TopIndex,
                    Reference = verseIndex.TopIndex.HasValue
                        ? $"{chapter}:{verseIndex.Index}-{verseIndex.TopIndex.Value}"
                        : $"{chapter}:{verseIndex.Index}",
                    Text = WebUtility.HtmlDecode(text),
                    IsFullVerse = isFullVerse,
                    IsPartOfBigVerse = isPartOfBigVerse,
                    HasValueEvenIfEmpty = hasValueEvenIfEmpty
                });
            }
            catch
            {
                // Missing verses are skipped so ranges can still return the verses that exist.
            }
        }

        private static string FormatReference(string bookShortName, VerseTextRequest request)
        {
            if (request.Verse <= 0)
                return $"{bookShortName} {request.Chapter}";

            var topChapter = request.TopChapter.GetValueOrDefault(request.Chapter);
            if (request.TopVerse.GetValueOrDefault(0) <= 0 || (topChapter == request.Chapter && request.TopVerse == request.Verse))
                return $"{bookShortName} {request.Chapter}:{request.Verse}";

            var top = topChapter == request.Chapter
                ? request.TopVerse.Value.ToString()
                : $"{topChapter}:{request.TopVerse.Value}";
            return $"{bookShortName} {request.Chapter}:{request.Verse}-{top}";
        }

        private static IEnumerable<string> SplitTextParagraphs(string text)
        {
            return text
                .Replace("\r\n", "\n")
                .Replace('\r', '\n')
                .Split('\n')
                .Select(p => p.Trim())
                .Where(p => p.Length > 0);
        }

        private static string ParseHtml(IDocumentParser parser, string html, List<ParagraphParseResult> paragraphs, bool updateHtml)
        {
            var htmlDocument = new HtmlDocument
            {
                GlobalAttributeValueQuote = AttributeValueQuote.DoubleQuote,
                OptionOutputOptimizeAttributeValues = false
            };
            htmlDocument.LoadHtml(html);
            foreach (var childNode in htmlDocument.DocumentNode.ChildNodes.ToList())
                ParseNode(parser, childNode, !updateHtml, paragraphs);
            return updateHtml ? htmlDocument.DocumentNode.OuterHtml : null;
        }

        private static void ParseNode(IDocumentParser parser, HtmlNode node, bool isReadonly, List<ParagraphParseResult> paragraphs)
        {
            var state = GetParagraphType(node);
            if (state.IsHierarchical())
            {
                using (parser.ParseHierarchyElement(state))
                {
                    if (IsHierarchy(node))
                    {
                        foreach (var childNode in node.ChildNodes.ToList())
                            ParseNode(parser, childNode, state == ElementType.Title || isReadonly, paragraphs);
                    }
                    else
                    {
                        ParseParagraph(parser, node, state == ElementType.Title || isReadonly, paragraphs);
                    }
                }
            }
            else
            {
                ParseParagraph(parser, node, isReadonly, paragraphs);
            }
        }

        private static void ParseParagraph(IDocumentParser parser, string html, List<ParagraphParseResult> paragraphs)
        {
            ParseParagraph(parser, new HtmlNodeWrapper(html), false, paragraphs);
        }

        private static void ParseTextParagraph(IDocumentParser parser, string text, List<ParagraphParseResult> paragraphs)
        {
            ParseParagraph(parser, new PlainTextNodeWrapper(text), true, paragraphs);
        }

        private static void ParseParagraph(IDocumentParser parser, HtmlNode node, bool isReadonly, List<ParagraphParseResult> paragraphs)
        {
            ParseParagraph(parser, new HtmlNodeWrapper(node, isReadonly), isReadonly, paragraphs);
        }

        private static void ParseParagraph(IDocumentParser parser, IXmlNode nodeWrapper, bool isReadonly, List<ParagraphParseResult> paragraphs)
        {
            if (nodeWrapper.HasChildNodes() || nodeWrapper.IsValuableTextNode(IXmlTextNodeMode.Exact))
            {
                var result = parser.ParseParagraph(nodeWrapper);
                if (!string.IsNullOrWhiteSpace(result.Text) || result.IsValuable)
                    paragraphs.Add(result);
            }
        }

        private static bool IsHierarchy(HtmlNode node)
        {
            return node.ChildNodes.Any(n =>
                n.NodeType != HtmlNodeType.Text
                && n.NodeType != HtmlNodeType.Comment
                && !HtmlTags.IsInlineElement(n.Name));
        }

        private static ElementType GetParagraphType(HtmlNode node)
        {
            switch (node.Name)
            {
                case HtmlTags.Table:
                    return ElementType.Table;
                case HtmlTags.TableRow:
                    return ElementType.TableRow;
                case HtmlTags.Head:
                    if (node.ParentNode?.Name == HtmlTags.Html)
                        return ElementType.Title;
                    break;
            }

            if (HtmlTags.BlockElements.Contains(node.Name))
                return ElementType.HierarchicalBlock;

            if (HtmlTags.Lists.Contains(node.Name))
                return ElementType.List;

            if (HtmlTags.ListElements.Contains(node.Name))
                return ElementType.ListElement;

            if (HtmlTags.TableCells.Contains(node.Name))
                return ElementType.TableCell;

            if (HtmlTags.TableBodys.Contains(node.Name))
                return ElementType.TableBody;

            return ElementType.SimpleBlock;
        }

        private static ParseParagraphResponse ToParagraphResponse(ParagraphParseResult result)
        {
            return new ParseParagraphResponse
            {
                Index = result.ParagraphIndex,
                Path = result.ParagraphPath,
                Text = result.Text,
                VersesCount = result.VersesCount,
                References = result.VerseEntries.Select(ToReferenceResponse).ToList(),
                NotFound = result.NotFoundVerses.Select(ToNotFoundResponse).ToList()
            };
        }

        private static VerseReferenceResponse ToReferenceResponse(VerseEntry entry)
        {
            var pointer = entry.VersePointer;
            return new VerseReferenceResponse
            {
                OriginalText = pointer.GetOriginalVerseString(),
                Normalized = pointer.ToString(),
                BookIndex = pointer.BookIndex,
                BookName = pointer.Book?.Name,
                BookShortName = pointer.Book?.FriendlyShortName,
                Chapter = pointer.Chapter,
                Verse = pointer.Verse,
                TopChapter = pointer.MostTopChapter,
                TopVerse = pointer.MostTopVerse,
                IsChapter = pointer.IsChapter,
                StartIndex = entry.StartIndex,
                EndIndex = entry.EndIndex,
                EntryType = entry.EntryType.ToString(),
                EntryOptions = entry.EntryOptions.ToString()
            };
        }

        private static VerseRelationResponse ToRelationResponse(CalculatedVerseRelation relation)
        {
            return new VerseRelationResponse
            {
                ParagraphIndex = relation.Paragraph.ParagraphIndex,
                ReferenceIndex = relation.ReferenceIndex,
                VerseId = relation.VerseId,
                RelativeParagraphIndex = relation.RelativeParagraph.ParagraphIndex,
                RelativeReferenceIndex = relation.RelativeReferenceIndex,
                RelativeVerseId = relation.RelativeVerseId,
                RelationWeight = relation.RelationWeight
            };
        }

        private static VerseNotFoundResponse ToNotFoundResponse(SimpleVersePointer pointer)
        {
            return new VerseNotFoundResponse
            {
                BookIndex = pointer.BookIndex,
                Chapter = pointer.Chapter,
                Verse = pointer.Verse,
                TopChapter = pointer.MostTopChapter,
                TopVerse = pointer.MostTopVerse,
                IsChapter = pointer.IsChapter,
                Normalized = pointer.ToString()
            };
        }

        private sealed class ParserDocumentId : IDocumentId
        {
            public ParserDocumentId(int documentId, bool isReadonly = true)
            {
                DocumentId = documentId;
                IsReadonly = isReadonly;
            }

            public int DocumentId { get; }

            public bool Changed { get; private set; }

            public bool IsReadonly { get; private set; }

            public void SetReadonly()
            {
                IsReadonly = true;
            }

            public void SetChanged()
            {
                Changed = true;
            }
        }

        private sealed class ReadOnlyDocumentProviderInfo : IDocumentProviderInfo
        {
            private readonly IVerseLinkService verseLinkService;
            private readonly bool isReadonly;

            public ReadOnlyDocumentProviderInfo(IVerseLinkService verseLinkService, bool isReadonly = true)
            {
                this.verseLinkService = verseLinkService;
                this.isReadonly = isReadonly;
            }

            public bool IsReadonly => isReadonly;

            public FileType[] SupportedFileTypes => new[] { FileType.Html, FileType.Text, FileType.OneNote };

            public string GetVersePointerLink(VersePointer versePointer)
            {
                return $"<a href='{verseLinkService.GetVerseLink(versePointer)}'>{WebUtility.HtmlEncode(versePointer.GetOriginalVerseString())}</a>";
            }
        }
    }

}
