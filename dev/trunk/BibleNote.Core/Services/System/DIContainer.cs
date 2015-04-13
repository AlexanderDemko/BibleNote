using BibleNote.Core.Contracts;
using Microsoft.Practices.Unity;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace BibleNote.Core.Services.System
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
            Container.RegisterType<ITextParserService, TextParserService>(new TransientLifetimeManager());
            Container.RegisterType<IBibleParallelTranslationConnectorManager, BibleParallelTranslationConnectorManager>(new ContainerControlledLifetimeManager());
            Container.RegisterType<IBibleParallelTranslationManager, BibleParallelTranslationManager>(new ContainerControlledLifetimeManager());
            Container.RegisterType<IVerseRecognitionService, VerseRecognitionService>(new TransientLifetimeManager());
            Container.RegisterType<IVersePointerFactory, VersePointerFactory>(new TransientLifetimeManager());
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
