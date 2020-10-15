using BibleNote.Analytics.Common.DiContainer;
using BibleNote.Analytics.Providers.FileSystem.DocumentId;
using BibleNote.Analytics.Providers.Html;
using BibleNote.Analytics.Services;
using BibleNote.Analytics.Services.Configuration.Contracts;
using BibleNote.Analytics.Services.DocumentProvider.Contracts;
using BibleNote.Analytics.Services.ModulesManager.Contracts;
using Microsoft.Extensions.DependencyInjection;
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Windows;
using TikaOnDotNet.TextExtraction;

namespace VerseDifferencesFinder
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
            cbModules.ItemsSource = GetModules().Keys;
            cbModules.SelectedItem = "rst";
        }

        private void Button_Click(object sender, RoutedEventArgs e)
        {
            if (cbModules.SelectedItem == null)
            {
                MessageBox.Show("Please select target module");
                return;
            }

            if (string.IsNullOrEmpty(tbSourceFile.Text))
            {
                MessageBox.Show("Please select source file");
                return;
            }

            var moduleShortName = cbModules.SelectedItem.ToString();
            InitApp(moduleShortName);

            var sourceFilePath = GetTextFilePath(tbSourceFile.Text); 
            var result = FindVersesDifferences(sourceFilePath);
            SaveResults(result);
        }

        private string GetTextFilePath(string userFilePath)
        {
            var fileExtension = Path.GetExtension(userFilePath);
            if (fileExtension == ".txt" || fileExtension == ".docx")
                return userFilePath;

            var tempFilePath = Path.Combine(Directory.GetCurrentDirectory(), TempFileName);
            var text = GetPdfText(userFilePath);
            File.WriteAllText(TempFileName, text);
            return tempFilePath;
        }

        private void SaveResults(List<string> result)
        {
            if (!result.Any())
                result.Add("There are no such verses");

            var filePath = Path.Combine(Directory.GetCurrentDirectory(), ResultsFileName);
            File.WriteAllText(filePath, string.Join(Environment.NewLine, result));
            System.Diagnostics.Process.Start("notepad.exe", filePath);
        }

        private List<string> FindVersesDifferences(string sourceFilePath)
        {
            var documentProvider = GetDocumentProvider(sourceFilePath);

            var parseResult = documentProvider.ParseDocument(new FileDocumentId(0, sourceFilePath, true));
            var parseResults = parseResult.GetAllParagraphParseResults().ToList();
            var versesFromOtherModules = parseResults
                .SelectMany(pr => pr.VerseEntries
                                    .Where(ve => ve.VersePointer.ModuleShortName != null)
                                    .Select(ve => ve.VersePointer));

            var versesWithDifferentChapterOrVerse = versesFromOtherModules
                .Where(v => v.VerseNumber != v.OriginalVerseNumber
                         || v.TopVerseNumber != v.OriginalTopVerseNumber);

            return versesWithDifferentChapterOrVerse
                .Select(v => $"{v.OriginalVerseName} => {v}")
                .ToList();
        }

        private IDocumentProvider GetDocumentProvider(string sourceFilePath)
        {
            IDocumentProvider documentProvider;
            switch (Path.GetExtension(sourceFilePath))
            {
                case ".txt":
                    documentProvider = ServiceProvider.GetService<HtmlProvider>();
                    break;
                case ".docx":
                    documentProvider = ServiceProvider.GetService<WordProvider>();
                    break;
                default:
                    throw new NotSupportedException(sourceFilePath);
            }

            return documentProvider;
        }

        private void InitApp(string moduleShortName)
        {
            var services = new ServiceCollection()
                .AddApplicatonServices<ServicesModule>()
                .AddApplicatonServices<HtmlModule>()
                .AddApplicatonServices<WordModule>()
                .AddScoped<IConfigurationManager>(sp => new ConfigurationManager(moduleShortName))
                .AddScoped<HtmlProvider>()
                .AddScoped<WordProvider>()
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
                Filter = "Text files (*.txt)|*.txt|Word files (*.docx)|*.docx|PDF Files (*.pdf)|*.pdf"
            };

            if (dlg.ShowDialog() == true)
                return dlg.FileName;
            else
                return null;
        }

        private Dictionary<string, string> GetModules()
        {
            var modules = Directory.GetFiles(ModulesFolderName, "*.bnm", SearchOption.TopDirectoryOnly);
            return modules.ToDictionary(f => Path.GetFileNameWithoutExtension(f));
        }

        private void btnSelectSourceFile_Click(object sender, RoutedEventArgs e)
        {
            tbSourceFile.Text = GetSourceFileName();
        }       

        public static string GetPdfText(string filePath)
        {
            return new TextExtractor().Extract(filePath, (text, metadata) =>
            {
                var metaDataDictionary = metadata.names().ToDictionary(name => name, metadata.getValues);
                return text;
            });
        }
    }
}
