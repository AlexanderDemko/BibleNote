using BibleNote.Analytics.Contracts;
using BibleNote.Analytics.Services.Environment;
using BibleNote.Analytics.Services.ParallelVerses;
using BibleNote.Analytics.Services.VerseParsing;
using Microsoft.Practices.Unity;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace BibleNote.Analytics.Services.System
{
    /// <summary>
    /// Simple wrapper for unity resolution.
    /// </summary>
    public class DIContainer
    {        
        public static IUnityContainer Container { get; private set; }        

        /// <summary>
        /// Static constructor for DependencyFactory which will 
        /// initialize the unity container.
        /// </summary>
        static DIContainer()
        {
            Container = new UnityContainer();                                   
        }

        public static void InitWithDefaults()
        {
            Container.RegisterType<ILogger, Logger>(new ContainerControlledLifetimeManager());
            Container.RegisterType<IConfigurationManager, ConfigurationManager>(new ContainerControlledLifetimeManager(), new InjectionConstructor(true));
            Container.RegisterType<IModulesManager, ModulesManager>(new ContainerControlledLifetimeManager());
            Container.RegisterType<IParagraphParserService, ParagraphParserService>(new TransientLifetimeManager());
            Container.RegisterType<IBibleParallelTranslationConnectorManager, BibleParallelTranslationConnectorManager>(new ContainerControlledLifetimeManager());
            Container.RegisterType<IBibleParallelTranslationManager, BibleParallelTranslationManager>(new ContainerControlledLifetimeManager());
            Container.RegisterType<IVerseRecognitionService, VerseRecognitionService>(new TransientLifetimeManager());
            Container.RegisterType<IVersePointerFactory, VersePointerFactory>(new TransientLifetimeManager());
            Container.RegisterType<IApplicationManager, ApplicationManager>(new ContainerControlledLifetimeManager());
        }

        /// <summary>
        /// Resolves the type parameter T to an instance of the appropriate type.
        /// </summary>
        /// <typeparam name="T">Type of object to return</typeparam>
        public static T Resolve<T>()
        {
            return Container.Resolve<T>();            
        }
    }
}
