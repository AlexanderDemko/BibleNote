using System;
using System.Collections.Generic;
using System.IO;
using System.IO.Pipes;
using System.Text;

namespace BibleNote.Infrastructure.SingleInstance
{
    public class Publisher
    {
        private readonly string applicationId;
        public Publisher(string applicationId)
        {
            this.applicationId = applicationId;
        }

        public void SendData(string[] args)
        {
            using var client = new NamedPipeClientStream(applicationId);
            try
            {
                client.Connect(0);
            }
            catch (TimeoutException)
            {
                // todo: start BibleNote.exe with args
            }
            
            using var writer = new BinaryWriter(client, Encoding.UTF8);
            writer.Write(args.Length);
            for (int i = 0; i < args.Length; i++)
            {
                writer.Write(args[i]);
            }
        }
    }
}
