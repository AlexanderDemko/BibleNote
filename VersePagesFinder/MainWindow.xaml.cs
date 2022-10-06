using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Threading.Tasks;
using System.Windows;
using BibleNote.Common.DiContainer;
using BibleNote.Domain.Enums;
using BibleNote.Providers.FileSystem.DocumentId;
using BibleNote.Providers.Html;
using BibleNote.Providers.Word;
using BibleNote.Services;
using BibleNote.Services.Configuration.Contracts;
using BibleNote.Services.Contracts;
using BibleNote.Services.ModulesManager.Contracts;
using BibleNote.Services.ModulesManager.Models;
using BibleNote.Services.ModulesManager.Scheme.ZefaniaXml;
using BibleNote.Services.VerseParsing.Contracts;
using BibleNote.Services.VerseParsing.Models;
using Microsoft.Extensions.DependencyInjection;
using UglyToad.PdfPig;
using UglyToad.PdfPig.Content;
using UglyToad.PdfPig.DocumentLayoutAnalysis.TextExtractor;

namespace BibleNote.VersePagesFinder
{
    public partial class MainWindow : Window
    {
        const string ModulesFolderName = "Modules";
        const string ResultsFileName = "results.txt";
        const string TempFileName = "temp.txt";

        public ServiceProvider ServiceProvider { get; private set; }

        public MainWindow()
        {
            InitializeComponent();
        }

        private async void Button_Click(object sender, RoutedEventArgs e)
        {
            if (string.IsNullOrEmpty(tbSourceFile.Text))
            {
                MessageBox.Show("Please select a source file");
                return;
            }

            InitApp("rst");

            var sourceFilePath = tbSourceFile.Text; 
            var resultFilePath = Path.Combine(Directory.GetCurrentDirectory(), ResultsFileName);
            ExtractPdfVersePages(sourceFilePath, resultFilePath);
            System.Diagnostics.Process.Start("notepad.exe", resultFilePath);
        }
        
        private void ExtractPdfVersePages(string pdfFilePath, string resultFilePath)
        {
            var documentParserFactory = ServiceProvider.GetService<IDocumentParserFactory>();
            var modulesManager = ServiceProvider.GetService<IModulesManager>();
            var documentProvider = new MockDocumentProviderInfo(
                ServiceProvider.GetService<IVerseLinkService>()) { IsReadonly = true };
            var mockDocumentId = new FileDocumentId(0, null, true);

            var versesDictionary = new Dictionary<SimpleVersePointer, List<int>>();
            var verseEntriesCount = 0;
            using var pdf = PdfDocument.Open(pdfFilePath);
            foreach (var page in pdf.GetPages())
            {
                var text = ContentOrderTextExtractor.GetText(page);

                var verses = GetPdfPageVerses(text, documentParserFactory, documentProvider, mockDocumentId);
                verseEntriesCount += verses.Count;
                EnrichVersesDictionary(verses, versesDictionary, page);
            }

            SaveResults(versesDictionary, verseEntriesCount, resultFilePath, modulesManager);
        }

        private static void SaveResults(
            Dictionary<SimpleVersePointer, 
            List<int>> versesDictionary,
            int verseEntriesCount,
            string filePath,
            IModulesManager modulesManager)
        {
            var bibleStructure = modulesManager.GetCurrentModuleInfo().BibleStructure;
            var bibleContent = modulesManager.GetCurrentBibleContent();
            
            using var fileStream = new FileStream(filePath, FileMode.Create);
            using var streamWriter = new StreamWriter(fileStream);
            streamWriter.WriteLine($"Total verse entries count: {verseEntriesCount}");
            
            var versesGroupedByBook = versesDictionary
                .OrderBy(vp => vp.Key.BookIndex)
                .ThenBy(vp => vp.Key.VerseNumber)
                .GroupBy(v => v.Key.BookIndex)
                .ToDictionary(v => v.Key);
           
            foreach (var bookInfo in bibleStructure.BibleBooks)
            {
                if (!versesGroupedByBook.ContainsKey(bookInfo.Index))
                    continue;

                var book = versesGroupedByBook[bookInfo.Index];
                
                streamWriter.WriteLine(bibleStructure.BibleBooks.Single(b => b.Index == book.Key).Name);

                var prevVersePages = string.Empty;
                VerseNumber? firstVerseNumber = null;
                VerseNumber? prevVerseNumber = null;
                foreach (var verse in book)
                {
                    var versePages = string.Join(", ", verse.Value);
                    if (!string.IsNullOrEmpty(prevVersePages) 
                        && (versePages != prevVersePages || !IsNextVerse(bibleContent, book.Key, prevVerseNumber.Value, verse.Key.VerseNumber)))
                    {
                        WriteVerseLine(streamWriter, firstVerseNumber, prevVerseNumber, prevVersePages);
                        firstVerseNumber = verse.Key.VerseNumber;
                        prevVerseNumber = verse.Key.VerseNumber;
                        prevVersePages = versePages;
                    }
                    else
                    {
                        prevVerseNumber = verse.Key.VerseNumber;
                        if (string.IsNullOrEmpty(prevVersePages))
                        {
                            prevVersePages = versePages;
                            firstVerseNumber = verse.Key.VerseNumber;
                        }
                    }
                }

                WriteVerseLine(streamWriter, firstVerseNumber, prevVerseNumber, prevVersePages);
            }
        }

        private static bool IsNextVerse(
            XMLBIBLE bibleContent, 
            int bookIndex, 
            VerseNumber verseNumber,
            VerseNumber nextVerseNumber)
        {
            if (verseNumber.IsChapter || nextVerseNumber.IsChapter)
                return false;
            
            if (verseNumber.Chapter == nextVerseNumber.Chapter)
            {
                return verseNumber.Verse == nextVerseNumber.Verse - 1;
            }
            
            if (verseNumber.Chapter == nextVerseNumber.Chapter - 1)
            {
                var chapterVersesCount = bibleContent
                    .BooksDictionary[bookIndex]
                    .Chapters[verseNumber.Chapter - 1]
                    .Verses.Count;

                return verseNumber.Verse == chapterVersesCount && nextVerseNumber.Verse == 1;
            }

            return false;
        }

        private static void WriteVerseLine(
            StreamWriter streamWriter,
            VerseNumber? firstVerseNumber,
            VerseNumber? prevVerseNumber,
            string versePages)
        {
            var verseString = firstVerseNumber == null || firstVerseNumber == prevVerseNumber
                ? prevVerseNumber.ToString()
                : firstVerseNumber.Value.Chapter == prevVerseNumber.Value.Chapter
                    ? $"{firstVerseNumber}-{prevVerseNumber.Value.Verse}" 
                    : $"{firstVerseNumber}-{prevVerseNumber}";
            streamWriter.WriteLine(verseString + "\t" + versePages);
        }

        private static void EnrichVersesDictionary(List<VersePointer> verses, Dictionary<SimpleVersePointer, List<int>> versesDictionary, Page page)
        {
            foreach (var verse in verses)
            {
                foreach (var subVerse in verse.SubVerses.Verses)
                {
                    if (!versesDictionary.ContainsKey((subVerse)))
                        versesDictionary.Add(subVerse, new List<int>());

                    var versePages = versesDictionary[subVerse];

                    if (!versePages.Contains(page.Number))
                        versePages.Add(page.Number);
                }
            }
        }

        private static List<VersePointer> GetPdfPageVerses(
            string text,
            IDocumentParserFactory documentParserFactory,
            IDocumentProviderInfo documentProvider,
            IDocumentId mockDocumentId)
        {
            var node = new HtmlNodeWrapper(text);
            using var docParser = documentParserFactory.Create(documentProvider, mockDocumentId);
            var paragraphParseResult = docParser.ParseParagraph(node);

            return paragraphParseResult
                .VerseEntries.Select(ve => ve.VersePointer)
                .ToList();
        }

        private void InitApp(string moduleShortName)
        {
            var services = new ServiceCollection()
                .AddApplicatonServices<ServicesModule>()
                .AddSingleton<IConfigurationManager>(sp => new ConfigurationManager(moduleShortName))
                .AddTransient<HtmlProvider>()
                .AddTransient<WordProvider>()
                .AddLogging();

            ServiceProvider = services
               .BuildServiceProvider();

            var modulesManager = ServiceProvider.GetService<IModulesManager>();

            UploadModules(moduleShortName, modulesManager);
        }

        private void UploadModules(string moduleShortName, IModulesManager modulesManager)
        {
            var modules = GetModules();
            var targetModule = modules[moduleShortName];
            modulesManager.UploadModule(targetModule, moduleShortName);

            foreach (var module in modules.Where(m => m.Key != moduleShortName))
            {
                modulesManager.UploadModule(module.Value, module.Key);
            }
        }

        private static string GetSourceFileName()
        {
            var dlg = new Microsoft.Win32.OpenFileDialog
            {
                Filter = "PDF Files (*.pdf)|*.pdf"
            };

            if (dlg.ShowDialog() == true)
                return dlg.FileName;
            else
                return null;
        }

        private Dictionary<string, string> GetModules()
        {
            if (!Directory.Exists(ModulesFolderName))
            {
                MessageBox.Show($"{ModulesFolderName} folder was not found");
                Application.Current.Shutdown();
                return null;
            }

            var modules = Directory.GetFiles(ModulesFolderName, "*.bnm", SearchOption.TopDirectoryOnly);
            return modules.ToDictionary(f => Path.GetFileNameWithoutExtension(f));
        }

        private void btnSelectSourceFile_Click(object sender, RoutedEventArgs e)
        {
            tbSourceFile.Text = GetSourceFileName();
        }     
    }
}
