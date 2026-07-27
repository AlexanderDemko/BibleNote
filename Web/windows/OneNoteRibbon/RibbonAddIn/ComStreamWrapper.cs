using System;
using System.IO;
using System.Runtime.InteropServices;
using System.Runtime.InteropServices.ComTypes;

namespace BibleNote.OneNoteRibbon
{
    internal sealed class ComStreamWrapper : IStream
    {
        private readonly Stream stream;

        public ComStreamWrapper(Stream stream)
        {
            this.stream = stream;
        }

        public void Clone(out IStream copy)
        {
            var position = stream.Position;
            stream.Position = 0;
            var memory = new MemoryStream();
            stream.CopyTo(memory);
            memory.Position = position;
            stream.Position = position;
            copy = new ComStreamWrapper(memory);
        }

        public void Commit(int commitFlags)
        {
            stream.Flush();
        }

        public void CopyTo(IStream destination, long bytesToCopy, IntPtr bytesRead, IntPtr bytesWritten)
        {
            var buffer = new byte[81920];
            long totalRead = 0;
            long totalWritten = 0;

            while (totalRead < bytesToCopy)
            {
                var requested = (int)Math.Min(buffer.Length, bytesToCopy - totalRead);
                var read = stream.Read(buffer, 0, requested);
                if (read == 0)
                    break;

                totalRead += read;
                destination.Write(buffer, read, IntPtr.Zero);
                totalWritten += read;
            }

            WriteCount(bytesRead, totalRead);
            WriteCount(bytesWritten, totalWritten);
        }

        public void LockRegion(long offset, long byteCount, int lockType)
        {
            throw new NotSupportedException();
        }

        public void Read(byte[] buffer, int byteCount, IntPtr bytesRead)
        {
            WriteCount(bytesRead, stream.Read(buffer, 0, byteCount));
        }

        public void Revert()
        {
            throw new NotSupportedException();
        }

        public void Seek(long offset, int origin, IntPtr newPosition)
        {
            var position = stream.Seek(offset, (SeekOrigin)origin);
            WriteCount(newPosition, position);
        }

        public void SetSize(long newSize)
        {
            stream.SetLength(newSize);
        }

        public void Stat(out System.Runtime.InteropServices.ComTypes.STATSTG statistics, int statFlag)
        {
            statistics = new System.Runtime.InteropServices.ComTypes.STATSTG
            {
                cbSize = stream.Length,
                type = 2
            };
        }

        public void UnlockRegion(long offset, long byteCount, int lockType)
        {
            throw new NotSupportedException();
        }

        public void Write(byte[] buffer, int byteCount, IntPtr bytesWritten)
        {
            stream.Write(buffer, 0, byteCount);
            WriteCount(bytesWritten, byteCount);
        }

        private static void WriteCount(IntPtr pointer, long value)
        {
            if (pointer != IntPtr.Zero)
                Marshal.WriteInt64(pointer, value);
        }
    }
}
