using BibleNote.Analytics.Common.DiContainer;
using BibleNote.Analytics.Services.Configuration;
using BibleNote.Analytics.Services.Configuration.Contracts;
using BibleNote.Analytics.Services.DocumentProvider;
using BibleNote.Analytics.Services.DocumentProvider.Contracts;
using BibleNote.Analytics.Services.ModulesManager;
using BibleNote.Analytics.Services.ModulesManager.Contracts;
using BibleNote.Analytics.Services.ParallelVerses;
using BibleNote.Analytics.Services.ParallelVerses.Contracts;
using BibleNote.Analytics.Services.VerseParsing;
using BibleNote.Analytics.Services.VerseParsing.Contracts;
using BibleNote.Analytics.Services.VerseParsing.Contracts.ParseContext;
using BibleNote.Analytics.Services.VerseParsing.Models.ParseContext;
using BibleNote.Analytics.Services.VerseProcessing;
using BibleNote.Analytics.Services.VerseProcessing.Contracts;
using Microsoft.Extensions.DependencyInjection;

namespace BibleNote.Analytics.Services
{
    public class ServicesModule : ModuleBase
    {
        protected override void InitServices(IServiceCollection services)
        {
            services
                .AddScoped<IConfigurationManager, ConfigurationManager>()
                .AddScoped<IModulesManager, ModulesManager.ModulesManager>()
                .AddScoped<IBibleParallelTranslationConnectorManager, BibleParallelTranslationConnectorManager>()
                .AddScoped<IBibleParallelTranslationManager, BibleParallelTranslationManager>()
                .AddScoped<IVerseRecognitionService, VerseRecognitionService>()
                .AddScoped<IVersePointerFactory, VersePointerFactory>()
                .AddScoped<IApplicationManager, ApplicationManager>()
                .AddScoped<IVerseCorrectionService, VerseCorrectionService>()
                .AddScoped<IDocumentParserFactory, DocumentParserFactory>()
                .AddScoped<IDocumentParseResultProcessing, SaveVerseEntriesProcessing>()
                .AddScoped<IDocumentParseResultProcessing, SaveVerseRelationsProcessing>()
                .AddTransient<IStringParser, StringParser>()
                .AddTransient<IParagraphParser, ParagraphParser>()
                .AddTransient<IDocumentParser, DocumentParser>()
                .AddTransient<IDocumentParseContextEditor, DocumentParseContext>()
                .AddTransient<IAnalyzer, Analyzer>()
                .AddTransient<IVerseLinkService, VerseLinkService>()
                ;
        }
    }
}
