using BibleNote.Common.DiContainer;
using BibleNote.Services.Configuration;
using BibleNote.Services.Configuration.Contracts;
using BibleNote.Services.DocumentProvider;
using BibleNote.Services.DocumentProvider.Contracts;
using BibleNote.Services.ModulesManager;
using BibleNote.Services.ModulesManager.Contracts;
using BibleNote.Services.NavigationProvider;
using BibleNote.Services.NavigationProvider.Contracts;
using BibleNote.Services.ParallelVerses;
using BibleNote.Services.ParallelVerses.Contracts;
using BibleNote.Services.VerseParsing;
using BibleNote.Services.VerseParsing.Contracts;
using BibleNote.Services.VerseParsing.Contracts.ParseContext;
using BibleNote.Services.VerseParsing.Models.ParseContext;
using BibleNote.Services.VerseProcessing;
using BibleNote.Services.VerseProcessing.Contracts;
using Microsoft.Extensions.DependencyInjection;

namespace BibleNote.Services
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
                .AddTransient<INavigationProviderService, NavigationProviderService>()
                ;
        }
    }
}
